use std::collections::{HashMap, HashSet};
use std::thread;
use std::time::{Duration, Instant};

use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::types::{TreeScope, UIProperty};
use uiautomation::variants::Variant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::arena::{ElementArena, NodeRecord};
use super::super::budget::FIND_MAX_NODES;
use super::super::outline::{format_record_line, stored_from_record, CT_DOCUMENT};
use super::super::query_match::{find_record_priority, select_query_matches};
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
    let role_filter_raw = role_filter.map(|r| r as i32);
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
        role_filter_raw,
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
        lines.push(format_record_line(
            &record,
            0,
            &reference,
            Some(tier.label()),
        ));
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
        .find(|(_, r)| r.control_type_raw == CT_DOCUMENT)
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
