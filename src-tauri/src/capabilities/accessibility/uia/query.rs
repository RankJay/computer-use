use std::collections::{HashMap, HashSet};
use std::thread;
use std::time::{Duration, Instant};

use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::types::{ControlType, TreeScope, UIProperty};
use uiautomation::variants::Variant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::arena::{ElementArena, NodeRecord};
use super::super::budget::FIND_MAX_NODES;
use super::super::outline::{format_record_line, stored_from_record};
use super::super::state::{make_reference, SnapshotStore};
use super::super::types::{
    FindElementInput, QueryInput, TextResult, MAX_FIND_CANDIDATES, WAIT_POLL_MS,
};
use super::resolve::{parse_role, resolve_stored_element};
use super::session::{hwnd_from_id, map_uia_error, process_id_for_hwnd, UiaSession};
use super::tree_extract::project_element;

pub(super) fn find_element_impl(
    session: &UiaSession,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: FindElementInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    query_impl(
        session,
        arenas,
        store,
        QueryInput::from_find(input),
        deadline,
    )
}

pub(super) fn query_impl(
    session: &UiaSession,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: QueryInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    let input = input.clamped();
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(empty_find_result(store, input.hwnd));
        }

        match query_once(session, arenas, store, &input, deadline) {
            Ok(result) if !result.text.is_empty() => return Ok(result),
            Ok(result) if Instant::now() >= deadline => return Ok(result),
            Err(error) if error.code == "target_degraded" || error.code == "invalid_input" => {
                return Err(error);
            }
            Err(error) if Instant::now() >= deadline => return Err(error),
            Ok(_) | Err(_) => thread::sleep(Duration::from_millis(
                WAIT_POLL_MS.min(remaining.as_millis() as u64),
            )),
        }
    }
}

pub(super) fn wait_impl(
    session: &UiaSession,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: QueryInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    let result = query_impl(session, arenas, store, input, deadline)?;
    if result.text.is_empty() {
        return Err(CommandError::new(
            ErrorCode::WaitTimeout,
            "Timed out waiting for accessibility query match",
        ));
    }
    Ok(result)
}

fn empty_find_result(store: &SnapshotStore, hwnd: WindowId) -> TextResult {
    let generation = store.begin_generation(hwnd);
    TextResult::plain(String::new(), Some(generation))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchTier {
    AutomationId,
    ExactNameRole,
    SubstringRole,
    NameOnly,
}

fn query_once(
    session: &UiaSession,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: &QueryInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    let handle = hwnd_from_id(input.hwnd)?;
    let process_id = process_id_for_hwnd(input.hwnd).ok_or_else(|| {
        CommandError::new(
            ErrorCode::FindFailed,
            "Could not resolve process id for hwnd",
        )
    })?;

    if store.is_process_degraded(process_id) {
        return Err(CommandError::new(
            ErrorCode::TargetDegraded,
            "Target process is temporarily marked degraded after repeated snapshot timeouts",
        ));
    }

    let name_exact = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_lowercase());
    let name_contains = input
        .name_contains
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_ascii_lowercase());
    let automation_id = input
        .automation_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let role_filter = input.role.as_deref().map(parse_role).transpose()?;
    let limit = input.limit.unwrap_or(MAX_FIND_CANDIDATES as u32) as usize;

    if name_exact.is_none()
        && name_contains.is_none()
        && automation_id.is_none()
        && role_filter.is_none()
    {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "query requires at least one of name, nameContains, automationId, or role",
        ));
    }

    if Instant::now() >= deadline {
        return Ok(empty_find_result(store, input.hwnd));
    }

    let root = if let Some(scope_ref) = input.scope_reference.as_deref() {
        let stored = store.resolve_ref_or_stale(scope_ref)?;
        if stored.hwnd != input.hwnd {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "scopeReference does not belong to the provided hwnd",
            ));
        }
        resolve_stored_element(session, &stored)?
    } else {
        session
            .automation
            .element_from_handle_build_cache(handle, &session.subtree_cache)
            .map_err(|error| map_uia_error(error, ErrorCode::FindFailed))?
    };

    let condition = if let Some(auto_id) = automation_id {
        session
            .automation
            .create_property_condition(UIProperty::AutomationId, Variant::from(auto_id), None)
            .map_err(|error| map_uia_error(error, ErrorCode::FindFailed))?
    } else if let Some(role) = role_filter {
        session
            .automation
            .create_property_condition(UIProperty::ControlType, Variant::from(role as i32), None)
            .map_err(|error| map_uia_error(error, ErrorCode::FindFailed))?
    } else {
        session
            .automation
            .create_true_condition()
            .map_err(|error| map_uia_error(error, ErrorCode::FindFailed))?
    };

    let candidates =
        match root.find_all_build_cache(TreeScope::Descendants, &condition, &session.subtree_cache)
        {
            Ok(elements) => elements,
            Err(error) if error.code() == ERR_NOTFOUND => Vec::new(),
            Err(error) => return Err(map_uia_error(error, ErrorCode::FindFailed)),
        };

    let mut records = Vec::with_capacity(candidates.len());
    for (order, element) in candidates.into_iter().enumerate() {
        if Instant::now() >= deadline || records.len() as u32 >= FIND_MAX_NODES {
            break;
        }
        if let Some(mut record) = project_element(&element, None, 0, &[]) {
            enrich_record_from_arena(arenas.get(&input.hwnd), &mut record);
            records.push((order, record));
        }
    }

    let scope_depth = scope_depth_from_arena(
        arenas.get(&input.hwnd),
        store,
        input.scope_reference.as_deref(),
    );

    let search_records = prefer_document_scope(&records);
    let filtered: Vec<_> = search_records
        .into_iter()
        .filter(|(_, record)| {
            if let Some(enabled) = input.enabled {
                if record.enabled != enabled {
                    return false;
                }
            }
            if let Some(visible) = input.visible {
                if record.offscreen == visible {
                    return false;
                }
            }
            true
        })
        .collect();

    let (tier, mut matches) = select_query_matches(
        &filtered,
        name_exact.as_deref(),
        name_contains.as_deref(),
        automation_id,
        role_filter,
    );
    matches.sort_by_key(|(order, record)| (find_record_priority(record, scope_depth), *order));

    let generation = store.begin_generation(input.hwnd);
    let mut lines = Vec::new();
    let mut seen_runtime = HashSet::new();
    let mut emitted = 0usize;
    for (_order, record) in matches {
        if emitted >= limit {
            break;
        }
        if !record.runtime_id.is_empty() && !seen_runtime.insert(record.runtime_id.clone()) {
            continue;
        }
        emitted += 1;
        let reference = make_reference(emitted as u32, generation, input.hwnd);
        store.store_element(
            input.hwnd,
            generation,
            reference.clone(),
            stored_from_record(input.hwnd, process_id, &record),
        );
        let tier_label = match tier {
            MatchTier::AutomationId => "automation_id",
            MatchTier::ExactNameRole => "exact",
            MatchTier::SubstringRole => "substring",
            MatchTier::NameOnly => "name_only",
        };
        lines.push(format_record_line(&record, 0, &reference, Some(tier_label)));
    }

    Ok(TextResult {
        text: lines.join("\n"),
        generation: Some(generation),
        visited: Some(filtered.len() as u32),
        emitted: Some(emitted as u32),
        truncated: None,
        truncation_reason: None,
    })
}

fn prefer_document_scope(records: &[(usize, NodeRecord)]) -> Vec<(usize, NodeRecord)> {
    let Some((_, doc)) = records
        .iter()
        .find(|(_, r)| r.control_type_raw == ControlType::Document as i32)
    else {
        return records.to_vec();
    };
    let doc_runtime = doc.runtime_id.clone();
    if doc_runtime.is_empty() {
        return records.to_vec();
    }
    let filtered: Vec<_> = records
        .iter()
        .filter(|(_, r)| {
            r.runtime_id == doc_runtime
                || r.ancestor_chain.iter().any(|a| a.starts_with("Document:"))
        })
        .cloned()
        .collect();
    if filtered.len() > 1 {
        filtered
    } else {
        records.to_vec()
    }
}

fn select_query_matches(
    records: &[(usize, NodeRecord)],
    name_exact: Option<&str>,
    name_contains: Option<&str>,
    automation_id: Option<&str>,
    role_filter: Option<ControlType>,
) -> (MatchTier, Vec<(usize, NodeRecord)>) {
    if let Some(auto_id) = automation_id {
        let matches: Vec<_> = records
            .iter()
            .filter(|(_, r)| r.automation_id == auto_id)
            .filter(|(_, r)| role_matches(r, role_filter))
            .cloned()
            .collect();
        if !matches.is_empty() {
            return (MatchTier::AutomationId, matches);
        }
        if name_exact.is_none() && name_contains.is_none() {
            return (MatchTier::AutomationId, Vec::new());
        }
    }

    let name_lower = name_exact.or(name_contains).unwrap_or("");
    if name_lower.is_empty() {
        let role_only: Vec<_> = records
            .iter()
            .filter(|(_, r)| role_matches(r, role_filter))
            .cloned()
            .collect();
        return (MatchTier::SubstringRole, role_only);
    }

    if let Some(exact) = name_exact {
        let exact_role: Vec<_> = records
            .iter()
            .filter(|(_, r)| role_matches(r, role_filter) && r.name.to_ascii_lowercase() == exact)
            .cloned()
            .collect();
        if !exact_role.is_empty() {
            return (MatchTier::ExactNameRole, exact_role);
        }
    }

    let needle = name_contains.or(name_exact).unwrap_or(name_lower);
    let substring_role: Vec<_> = records
        .iter()
        .filter(|(_, r)| {
            role_matches(r, role_filter) && r.name.to_ascii_lowercase().contains(needle)
        })
        .cloned()
        .collect();
    if !substring_role.is_empty() {
        return (MatchTier::SubstringRole, substring_role);
    }

    let name_only: Vec<_> = records
        .iter()
        .filter(|(_, r)| r.name.to_ascii_lowercase().contains(needle))
        .cloned()
        .collect();
    (MatchTier::NameOnly, name_only)
}

fn role_matches(record: &NodeRecord, role_filter: Option<ControlType>) -> bool {
    match role_filter {
        Some(role) => record.control_type_raw == role as i32,
        None => true,
    }
}

fn find_record_priority(record: &NodeRecord, scope_depth: Option<u32>) -> (i32, i32, i32, i32) {
    let offscreen = if record.offscreen { 1 } else { 0 };
    let disabled = if record.enabled { 0 } else { 1 };
    let role = match record.control_type_raw {
        x if x == ControlType::Hyperlink as i32 => 0,
        x if x == ControlType::Button as i32 => 1,
        x if x == ControlType::ListItem as i32 => 2,
        x if x == ControlType::MenuItem as i32 => 3,
        x if x == ControlType::TabItem as i32 => 4,
        x if x == ControlType::TreeItem as i32 => 5,
        x if x == ControlType::Edit as i32 => 6,
        x if x == ControlType::ComboBox as i32 => 7,
        x if x == ControlType::Group as i32 => 40,
        x if x == ControlType::Text as i32 => 50,
        x if x == ControlType::Image as i32 => 55,
        _ => 20,
    };
    let distance = match scope_depth {
        Some(scope) => (record.depth as i32 - scope as i32).abs(),
        None => record.depth as i32,
    };
    (role, offscreen, disabled, distance)
}

fn enrich_record_from_arena(arena: Option<&ElementArena>, record: &mut NodeRecord) {
    let Some(arena) = arena else {
        return;
    };
    let Some(idx) = arena.find_by_runtime_id(&record.runtime_id) else {
        return;
    };
    let node = &arena.nodes[idx];
    record.parent = node.parent;
    record.depth = node.depth;
    if record.ancestor_chain.is_empty() {
        record.ancestor_chain = node.ancestor_chain.clone();
    }
}

fn scope_depth_from_arena(
    arena: Option<&ElementArena>,
    store: &SnapshotStore,
    scope_reference: Option<&str>,
) -> Option<u32> {
    let scope_reference = scope_reference?;
    let arena = arena?;
    let stored = store.resolve_ref(scope_reference)?;
    let idx = arena.find_by_runtime_id(&stored.runtime_id)?;
    Some(arena.nodes[idx].depth)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uiautomation::types::ControlType;

    #[test]
    fn find_match_tiers_are_deterministic() {
        let records = vec![
            (
                0,
                NodeRecord {
                    parent: None,
                    children: vec![],
                    runtime_id: vec![1],
                    automation_id: String::new(),
                    name: "Save As".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: ControlType::Button as i32,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
            ),
            (
                1,
                NodeRecord {
                    parent: None,
                    children: vec![],
                    runtime_id: vec![2],
                    automation_id: String::new(),
                    name: "Save".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: ControlType::Button as i32,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
            ),
        ];
        let (tier, matches) =
            select_query_matches(&records, None, Some("sav"), None, Some(ControlType::Button));
        assert_eq!(tier, MatchTier::SubstringRole);
        assert_eq!(matches.len(), 2);

        let (tier, matches) =
            select_query_matches(&records, None, Some("save"), None, Some(ControlType::Edit));
        assert_eq!(tier, MatchTier::NameOnly);
        assert_eq!(matches.len(), 2);

        let (tier, matches) = select_query_matches(
            &records,
            Some("save"),
            None,
            None,
            Some(ControlType::Button),
        );
        assert_eq!(tier, MatchTier::ExactNameRole);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].1.name, "Save");
    }

    #[test]
    fn find_priority_prefers_closer_to_scope() {
        let near = NodeRecord {
            parent: Some(0),
            children: vec![],
            runtime_id: vec![1],
            automation_id: String::new(),
            name: "Ok".to_string(),
            role: Some("Button".to_string()),
            control_type_raw: ControlType::Button as i32,
            enabled: true,
            offscreen: false,
            rect: None,
            value: None,
            ancestor_chain: vec![],
            depth: 2,
        };
        let far = NodeRecord {
            depth: 8,
            ..near.clone()
        };
        let near_p = find_record_priority(&near, Some(2));
        let far_p = find_record_priority(&far, Some(2));
        assert!(near_p < far_p);
    }
}
