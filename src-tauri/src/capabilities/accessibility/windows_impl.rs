use std::collections::{HashMap, HashSet, VecDeque};
use std::thread;
use std::time::{Duration, Instant};

use uiautomation::controls::WindowControl;
use uiautomation::core::{UIAutomation, UIElement, UITreeWalker};
use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::patterns::{
    UIExpandCollapsePattern, UIInvokePattern, UILegacyIAccessiblePattern, UIPatternType,
    UIRangeValuePattern, UIScrollItemPattern, UIScrollPattern, UISelectionItemPattern,
    UISelectionPattern, UITextPattern, UITogglePattern, UIValuePattern,
};
use uiautomation::types::{
    ControlType, ElementMode, Handle, Point, ScrollAmount, TreeScope, UIProperty,
};
use uiautomation::variants::{Value, Variant};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

use crate::capabilities::error::{CommandError, ErrorCode};

use super::arena::{HwndArena, NodeRecord};
use super::budget::{SearchBudget, FIND_MAX_NODES, SNAPSHOT_MAX_NODES};
use super::state::{make_reference, parse_reference, SnapshotStore, StoredElement};
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult, MAX_FIND_CANDIDATES, MAX_OUTLINE_CHARS, SIBLING_FINGERPRINT_EMIT,
    WAIT_POLL_MS,
};

fn process_id_for_hwnd(hwnd: i64) -> Option<u32> {
    let handle = hwnd_from_i64(hwnd).ok()?;
    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(handle.into(), Some(&mut process_id));
    }
    if process_id == 0 {
        None
    } else {
        Some(process_id)
    }
}

pub fn snapshot_timeout_ms(store: &SnapshotStore, hwnd: i64) -> u64 {
    if let Some(process_id) = process_id_for_hwnd(hwnd) {
        if !store.was_process_touched(process_id) {
            return super::types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS;
        }
    }
    super::types::TIMEOUT_SNAPSHOT_MS
}

pub fn process_id_for_hwnd_command(hwnd: i64) -> Option<u32> {
    process_id_for_hwnd(hwnd)
}

const CONNECTION_TIMEOUT_MS: u32 = 500;
const TRANSACTION_TIMEOUT_MS: u32 = 1_500;
const RESOLVE_RETRY_ATTEMPTS: u32 = 3;
const TRANSIENT_UIA_RETRY_MS: u64 = 120;

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct SnapshotStats {
    pub nodes_visited: u32,
    pub emitted: u32,
}

pub fn snapshot_impl(
    session: &UiaSession,
    arenas: &mut HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    Ok(snapshot_with_stats(session, arenas, store, input, deadline)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn snapshot_with_stats(
    session: &UiaSession,
    arenas: &mut HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
    let input = input.clamped();
    match input.reference.as_deref() {
        Some(reference) => snapshot_from_reference(
            session,
            arenas,
            store,
            reference,
            input.hwnd,
            input.max_depth,
            input.max_elements,
            deadline,
        ),
        None => {
            let hwnd = input.hwnd.ok_or_else(|| {
                CommandError::new(
                    ErrorCode::InvalidInput,
                    "accessibility_snapshot requires hwnd or reference",
                )
            })?;
            snapshot_from_hwnd(
                session,
                arenas,
                store,
                hwnd,
                input.max_depth,
                input.max_elements,
                deadline,
            )
        }
    }
}

fn snapshot_from_hwnd(
    session: &UiaSession,
    arenas: &mut HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    hwnd: i64,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
    let process_id = process_id_for_hwnd(hwnd).ok_or_else(|| {
        CommandError::new(
            ErrorCode::SnapshotFailed,
            "Could not resolve process id for hwnd",
        )
    })?;

    if store.is_process_degraded(process_id) {
        return Err(CommandError::new(
            ErrorCode::TargetDegraded,
            "Target process is temporarily marked degraded after repeated timeouts",
        ));
    }

    let _ = store.is_first_process_touch(process_id);

    let extracted = fetch_tree(session, hwnd, max_depth, deadline)?;
    let generation = store.begin_generation(hwnd);
    let outline = emit_outline_from_arena(
        store,
        hwnd,
        generation,
        process_id,
        &extracted.nodes,
        0,
        max_depth,
        max_elements,
        false,
    );

    arenas.insert(
        hwnd,
        HwndArena {
            generation,
            process_id,
            nodes: extracted.nodes,
        },
    );

    Ok(finalize_outline(outline, generation, extracted.used_bfs))
}

fn snapshot_from_reference(
    session: &UiaSession,
    arenas: &mut HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    reference: &str,
    hwnd_arg: Option<i64>,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let (_index, ref_generation, ref_hwnd) = parse_reference(reference).ok_or_else(|| {
        CommandError::new(
            ErrorCode::InvalidReference,
            "Reference must look like e14@3:123456",
        )
    })?;
    if let Some(hwnd) = hwnd_arg {
        if hwnd != stored.hwnd || hwnd != ref_hwnd {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "hwnd does not match reference window",
            ));
        }
    }

    if store.is_process_degraded(stored.process_id) {
        return Err(CommandError::new(
            ErrorCode::TargetDegraded,
            "Target process is temporarily marked degraded after repeated timeouts",
        ));
    }

    if let Some(arena) = arenas.get(&stored.hwnd) {
        if arena.generation == ref_generation {
            if let Some(root_idx) = arena.find_by_runtime_id(&stored.runtime_id) {
                let generation = store.begin_generation(stored.hwnd);
                let outline = emit_outline_from_arena(
                    store,
                    stored.hwnd,
                    generation,
                    stored.process_id,
                    &arena.nodes,
                    root_idx,
                    max_depth,
                    max_elements,
                    true,
                );
                if let Some(arena_mut) = arenas.get_mut(&stored.hwnd) {
                    arena_mut.generation = generation;
                }
                return Ok(finalize_outline(outline, generation, false));
            }
        }
    }

    let element = resolve_stored_element(session, &stored)?;
    let extracted = fetch_tree_from_element(session, &element, max_depth, deadline)?;
    let generation = store.begin_generation(stored.hwnd);
    let outline = emit_outline_from_arena(
        store,
        stored.hwnd,
        generation,
        stored.process_id,
        &extracted.nodes,
        0,
        max_depth,
        max_elements,
        true,
    );
    arenas.insert(
        stored.hwnd,
        HwndArena {
            generation,
            process_id: stored.process_id,
            nodes: extracted.nodes,
        },
    );

    Ok(finalize_outline(outline, generation, extracted.used_bfs))
}

fn finalize_outline(
    outline: OutlineEmit,
    generation: u32,
    used_bfs: bool,
) -> (TextResult, SnapshotStats) {
    let mut text = outline.text;
    if outline.truncated {
        if let Some(reason) = &outline.truncation_reason {
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&format!("[truncated:{reason}]"));
        }
    }
    if used_bfs {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str("[fetch:bfs_fallback]");
    }

    let stats = SnapshotStats {
        nodes_visited: outline.visited,
        emitted: outline.emitted,
    };
    (
        TextResult {
            text,
            generation: Some(generation),
            visited: Some(outline.visited),
            emitted: Some(outline.emitted),
            truncated: Some(outline.truncated),
            truncation_reason: outline.truncation_reason,
        },
        stats,
    )
}

pub fn find_element_impl(
    session: &UiaSession,
    arenas: &HashMap<i64, HwndArena>,
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

pub fn query_impl(
    session: &UiaSession,
    arenas: &HashMap<i64, HwndArena>,
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

pub fn wait_impl(
    session: &UiaSession,
    arenas: &HashMap<i64, HwndArena>,
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

fn empty_find_result(store: &SnapshotStore, hwnd: i64) -> TextResult {
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
    arenas: &HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    input: &QueryInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    let handle = hwnd_from_i64(input.hwnd)?;
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

fn enrich_record_from_arena(arena: Option<&HwndArena>, record: &mut NodeRecord) {
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
    arena: Option<&HwndArena>,
    store: &SnapshotStore,
    scope_reference: Option<&str>,
) -> Option<u32> {
    let scope_reference = scope_reference?;
    let arena = arena?;
    let stored = store.resolve_ref(scope_reference)?;
    let idx = arena.find_by_runtime_id(&stored.runtime_id)?;
    Some(arena.nodes[idx].depth)
}

pub fn get_text_impl(
    session: &UiaSession,
    arenas: &HashMap<i64, HwndArena>,
    store: &SnapshotStore,
    reference: &str,
) -> Result<GetTextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;

    if let Some(arena) = arenas.get(&stored.hwnd) {
        if let Some(root_idx) = arena.find_by_runtime_id(&stored.runtime_id) {
            let names = collect_text_names_from_arena(&arena.nodes, root_idx);
            if !names.is_empty() {
                return Ok(GetTextResult {
                    text: names.join("\n"),
                    method: "arena_text".to_string(),
                });
            }
            let node = &arena.nodes[root_idx];
            if node.control_type_raw == ControlType::Text as i32 && !node.name.trim().is_empty() {
                return Ok(GetTextResult {
                    text: node.name.clone(),
                    method: "arena_text".to_string(),
                });
            }
        }
    }

    let element = resolve_stored_element(session, &stored)?;

    if let Ok(pattern) = element.get_pattern::<UITextPattern>() {
        if let Ok(range) = pattern.get_document_range() {
            if let Ok(text) = range.get_text(-1) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Ok(GetTextResult {
                        text,
                        method: "text_pattern".to_string(),
                    });
                }
            }
        }
    }

    let names = collect_text_descendant_names(session, &element)?;
    if names.is_empty() {
        let own = element_name(&element);
        if !own.trim().is_empty()
            && element_control_type(&element)
                .ok()
                .is_some_and(|ct| ct == ControlType::Text)
        {
            return Ok(GetTextResult {
                text: own,
                method: "text_descendants".to_string(),
            });
        }
        return Ok(GetTextResult {
            text: String::new(),
            method: "empty".to_string(),
        });
    }

    Ok(GetTextResult {
        text: names.join("\n"),
        method: "text_descendants".to_string(),
    })
}

pub fn inspect_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<InspectResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let record = project_element_allow_text(&element, None, 0, &[]).ok_or_else(|| {
        CommandError::new(
            ErrorCode::InspectFailed,
            "Could not project accessibility element",
        )
    })?;

    let mut patterns = Vec::new();
    if element.get_pattern::<UIInvokePattern>().is_ok() {
        patterns.push("Invoke".to_string());
    }
    if element.get_pattern::<UIValuePattern>().is_ok() {
        patterns.push("Value".to_string());
    }
    if element.get_pattern::<UITogglePattern>().is_ok() {
        patterns.push("Toggle".to_string());
    }
    if element.get_pattern::<UITextPattern>().is_ok() {
        patterns.push("Text".to_string());
    }
    if element.get_pattern::<UISelectionPattern>().is_ok() {
        patterns.push("Selection".to_string());
    }
    if element.get_pattern::<UISelectionItemPattern>().is_ok() {
        patterns.push("SelectionItem".to_string());
    }
    if element.get_pattern::<UIExpandCollapsePattern>().is_ok() {
        patterns.push("ExpandCollapse".to_string());
    }
    if element.get_pattern::<UILegacyIAccessiblePattern>().is_ok() {
        patterns.push("LegacyIAccessible".to_string());
    }
    if element.get_pattern::<UIScrollPattern>().is_ok() {
        patterns.push("Scroll".to_string());
    }
    if element.get_pattern::<UIRangeValuePattern>().is_ok() {
        patterns.push("RangeValue".to_string());
    }

    let role = record.role.clone().unwrap_or_else(|| "unknown".to_string());
    let rect_text = match record.rect {
        Some((l, t, r, b)) => format!("rect=({l},{t},{r},{b})"),
        None => "rect=none".to_string(),
    };
    let mut lines = vec![
        format!("ref={reference}"),
        format!("name=\"{}\"", record.name.replace('"', "'")),
        format!("role={role}"),
        format!(
            "automationId=\"{}\"",
            record.automation_id.replace('"', "'")
        ),
        format!("runtimeId={:?}", record.runtime_id),
        format!("enabled={}", record.enabled),
        format!("offscreen={}", record.offscreen),
        rect_text,
        format!("patterns={}", patterns.join(",")),
    ];
    if let Some(value) = &record.value {
        lines.push(format!("value=\"{}\"", value.replace('"', "'")));
    }

    Ok(InspectResult {
        text: lines.join("\n"),
        name: record.name,
        role: record.role,
        automation_id: record.automation_id,
        runtime_id: record.runtime_id,
        enabled: record.enabled,
        offscreen: record.offscreen,
        value: record.value,
        rect: record.rect,
        patterns,
    })
}

pub fn get_selection_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<TextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let pattern = element.get_pattern::<UISelectionPattern>().map_err(|_| {
        CommandError::new(
            ErrorCode::SelectionUnavailable,
            "Selection pattern is not available on this element",
        )
    })?;
    let selected = pattern
        .get_selection()
        .map_err(|error| map_uia_error(error, ErrorCode::GetSelectionFailed))?;

    let generation = store.begin_generation(stored.hwnd);
    let mut lines = Vec::new();
    let mut emitted = 0u32;
    for selected_element in selected {
        let Some(record) = project_element_allow_text(&selected_element, None, 0, &[]) else {
            continue;
        };
        emitted = emitted.saturating_add(1);
        let item_ref = make_reference(emitted, generation, stored.hwnd);
        store.store_element(
            stored.hwnd,
            generation,
            item_ref.clone(),
            stored_from_record(stored.hwnd, stored.process_id, &record),
        );
        lines.push(format_record_line(&record, 0, &item_ref, Some("selected")));
    }

    Ok(TextResult {
        text: lines.join("\n"),
        generation: Some(generation),
        visited: Some(emitted),
        emitted: Some(emitted),
        truncated: None,
        truncation_reason: None,
    })
}

pub fn get_focused_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    hwnd: Option<i64>,
) -> Result<TextResult, CommandError> {
    let element = session
        .automation
        .get_focused_element_build_cache(&session.live_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::GetFocusedFailed))?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element.get_process_id().ok();
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::FocusMismatch,
                "Focused element is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(session, &element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

pub fn element_at_point_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    x: i32,
    y: i32,
    hwnd: Option<i64>,
) -> Result<TextResult, CommandError> {
    let element = session
        .automation
        .element_from_point_build_cache(Point::new(x, y), &session.live_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::ElementAtPointFailed))?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element.get_process_id().ok();
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::PointMismatch,
                "Element at point is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(session, &element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

fn collect_text_descendant_names(
    session: &UiaSession,
    root: &UIElement,
) -> Result<Vec<String>, CommandError> {
    let condition = session
        .automation
        .create_property_condition(
            UIProperty::ControlType,
            Variant::from(ControlType::Text as i32),
            None,
        )
        .map_err(|error| map_uia_error(error, ErrorCode::GetTextFailed))?;

    let elements =
        match root.find_all_build_cache(TreeScope::Descendants, &condition, &session.subtree_cache)
        {
            Ok(elements) => elements,
            Err(error) if error.code() == ERR_NOTFOUND => Vec::new(),
            Err(error) => return Err(map_uia_error(error, ErrorCode::GetTextFailed)),
        };

    let mut names = Vec::new();
    for element in elements {
        let name = element_name(&element);
        if !name.trim().is_empty() {
            names.push(name);
        }
    }
    Ok(names)
}

fn collect_text_names_from_arena(nodes: &[NodeRecord], root_idx: usize) -> Vec<String> {
    let mut names = Vec::new();
    let mut stack = vec![root_idx];
    while let Some(idx) = stack.pop() {
        let Some(node) = nodes.get(idx) else {
            continue;
        };
        if node.control_type_raw == ControlType::Text as i32 && !node.name.trim().is_empty() {
            // Skip the root itself when collecting descendants; caller handles own Text.
            if idx != root_idx {
                names.push(node.name.clone());
            }
        }
        for &child in node.children.iter().rev() {
            stack.push(child as usize);
        }
    }
    // If root is a container, also include Text names found above.
    // If root itself is Text with a name and no descendants, caller uses own-name path.
    names
}

fn resolve_element_hwnd(
    session: &UiaSession,
    element: &UIElement,
    preferred: Option<i64>,
) -> Result<i64, CommandError> {
    if let Some(hwnd) = preferred {
        hwnd_from_i64(hwnd)?;
        return Ok(hwnd);
    }

    if let Ok(handle) = element.get_native_window_handle() {
        let raw: isize = handle.into();
        if raw != 0 {
            return Ok(raw as i64);
        }
    }

    let mut current = element.clone();
    for _ in 0..16 {
        match session
            .control_walker
            .get_parent_build_cache(&current, &session.live_cache)
        {
            Ok(parent) => {
                if let Ok(handle) = parent.get_native_window_handle() {
                    let raw: isize = handle.into();
                    if raw != 0 {
                        return Ok(raw as i64);
                    }
                }
                current = parent;
            }
            Err(_) => break,
        }
    }

    Err(CommandError::new(
        ErrorCode::ResolveFailed,
        "Could not resolve window handle for element",
    ))
}

fn mint_projected_element(
    store: &SnapshotStore,
    hwnd: i64,
    element: &UIElement,
) -> Result<TextResult, CommandError> {
    let process_id = process_id_for_hwnd(hwnd)
        .or_else(|| element.get_process_id().ok())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ResolveFailed,
                "Could not resolve process id for element",
            )
        })?;

    let record = project_element_allow_text(element, None, 0, &[]).ok_or_else(|| {
        CommandError::new(
            ErrorCode::ResolveFailed,
            "Could not project accessibility element",
        )
    })?;

    let generation = store.begin_generation(hwnd);
    let reference = make_reference(1, generation, hwnd);
    store.store_element(
        hwnd,
        generation,
        reference.clone(),
        stored_from_record(hwnd, process_id, &record),
    );

    Ok(TextResult {
        text: format_record_line(&record, 0, &reference, None),
        generation: Some(generation),
        visited: Some(1),
        emitted: Some(1),
        truncated: None,
        truncation_reason: None,
    })
}

/// Like `project_element` but keeps Text nodes (needed for focused/hit-test targets).
fn project_element_allow_text(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
) -> Option<NodeRecord> {
    let control_type = element_control_type(element).ok()?;
    if matches!(
        control_type,
        ControlType::Image | ControlType::Separator | ControlType::ToolTip
    ) {
        return None;
    }
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    let enabled = element_is_enabled(element).unwrap_or(true);
    let offscreen = element_is_offscreen(element).unwrap_or(false);
    let rect = element_rect(element);
    let value = element_value_text(element).filter(|v| is_useful_value(v));
    Some(NodeRecord {
        parent,
        children: Vec::new(),
        runtime_id,
        automation_id,
        name,
        role: Some(control_type.to_string()),
        control_type_raw: control_type as i32,
        enabled,
        offscreen,
        rect,
        value,
        ancestor_chain: ancestors.to_vec(),
        depth,
    })
}

struct ExtractedTree {
    nodes: Vec<NodeRecord>,
    used_bfs: bool,
}

fn fetch_tree(
    session: &UiaSession,
    hwnd: i64,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let handle = hwnd_from_i64(hwnd)?;
    match session
        .automation
        .element_from_handle_build_cache(handle, &session.subtree_cache)
    {
        Ok(root) => {
            let mut nodes = Vec::new();
            let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
            extract_cached_subtree(&root, None, 0, max_depth, &[], &mut nodes, &mut budget)?;
            Ok(ExtractedTree {
                nodes,
                used_bfs: false,
            })
        }
        Err(error) if is_transaction_timeout(&error) || Instant::now() >= deadline => {
            fetch_tree_bfs(session, hwnd, max_depth, deadline)
        }
        Err(error) => {
            // Fall back to BFS on other bulk failures (provider quirks).
            match fetch_tree_bfs(session, hwnd, max_depth, deadline) {
                Ok(tree) => Ok(tree),
                Err(_) => Err(map_uia_error(error, ErrorCode::SnapshotFailed)),
            }
        }
    }
}

fn fetch_tree_from_element(
    session: &UiaSession,
    element: &UIElement,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    // Re-cache the live element with subtree scope.
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    if runtime_id.is_empty() {
        let mut nodes = Vec::new();
        let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
        extract_via_bfs_from(session, element, max_depth, &mut nodes, &mut budget)?;
        return Ok(ExtractedTree {
            nodes,
            used_bfs: true,
        });
    }

    let handle = element.get_native_window_handle().ok().and_then(|h| {
        let raw: isize = h.into();
        if raw == 0 {
            None
        } else {
            Some(raw as i64)
        }
    });

    if let Some(hwnd) = handle {
        return fetch_tree(session, hwnd, max_depth, deadline);
    }

    // Resolve via runtime id from a live window root if possible — else BFS from element.
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
    extract_via_bfs_from(session, element, max_depth, &mut nodes, &mut budget)?;
    Ok(ExtractedTree {
        nodes,
        used_bfs: true,
    })
}

fn fetch_tree_bfs(
    session: &UiaSession,
    hwnd: i64,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let handle = hwnd_from_i64(hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.children_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::SnapshotFailed))?;
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
    extract_via_bfs_from(session, &root, max_depth, &mut nodes, &mut budget)?;
    Ok(ExtractedTree {
        nodes,
        used_bfs: true,
    })
}

fn extract_cached_subtree(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    max_depth: u32,
    ancestors: &[String],
    nodes: &mut Vec<NodeRecord>,
    budget: &mut SearchBudget,
) -> Result<(), CommandError> {
    if budget.exhausted() || depth > max_depth {
        return Ok(());
    }
    if !budget.visit_soft() {
        return Ok(());
    }

    let Some(record) = project_element_allow_text(element, parent, depth, ancestors) else {
        return Ok(());
    };
    let idx = nodes.len() as u32;
    if let Some(parent_idx) = parent {
        if let Some(parent_node) = nodes.get_mut(parent_idx as usize) {
            parent_node.children.push(idx);
        }
    }
    let label = ancestor_label(&record);
    let mut child_ancestors = ancestors.to_vec();
    child_ancestors.push(label);
    nodes.push(record);

    if depth >= max_depth {
        return Ok(());
    }

    let children = element.get_cached_children().unwrap_or_default();
    for child in children {
        extract_cached_subtree(
            &child,
            Some(idx),
            depth + 1,
            max_depth,
            &child_ancestors,
            nodes,
            budget,
        )?;
    }
    Ok(())
}

fn extract_via_bfs_from(
    session: &UiaSession,
    root: &UIElement,
    max_depth: u32,
    nodes: &mut Vec<NodeRecord>,
    budget: &mut SearchBudget,
) -> Result<(), CommandError> {
    let true_condition = session
        .automation
        .create_true_condition()
        .map_err(|error| map_uia_error(error, ErrorCode::SnapshotFailed))?;

    let Some(root_record) = project_element_allow_text(root, None, 0, &[]) else {
        return Ok(());
    };
    if !budget.visit_soft() {
        return Ok(());
    }
    nodes.push(root_record);

    // Queue: (parent_idx, live_or_cached parent element for Children find)
    let mut queue: VecDeque<(u32, UIElement)> = VecDeque::new();
    queue.push_back((0, root.clone()));

    while let Some((parent_idx, parent_el)) = queue.pop_front() {
        if budget.exhausted() {
            break;
        }
        let parent_depth = nodes[parent_idx as usize].depth;
        if parent_depth >= max_depth {
            continue;
        }

        let children = match parent_el.find_all_build_cache(
            TreeScope::Children,
            &true_condition,
            &session.children_cache,
        ) {
            Ok(c) => c,
            Err(error) if error.code() == ERR_NOTFOUND => continue,
            Err(_) => continue,
        };

        let ancestors = {
            let node = &nodes[parent_idx as usize];
            let mut chain = node.ancestor_chain.clone();
            chain.push(ancestor_label(node));
            chain
        };

        for child in children {
            if budget.exhausted() || !budget.visit_soft() {
                break;
            }
            let depth = parent_depth + 1;
            let Some(record) =
                project_element_allow_text(&child, Some(parent_idx), depth, &ancestors)
            else {
                continue;
            };
            let idx = nodes.len() as u32;
            nodes[parent_idx as usize].children.push(idx);
            nodes.push(record);
            if depth < max_depth {
                queue.push_back((idx, child));
            }
        }
    }
    Ok(())
}

fn project_element(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
) -> Option<NodeRecord> {
    let control_type = element_control_type(element).ok()?;
    if should_skip_control(control_type) {
        return None;
    }
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    let enabled = element_is_enabled(element).unwrap_or(true);
    let offscreen = element_is_offscreen(element).unwrap_or(false);
    let rect = element_rect(element);
    let value = element_value_text(element).filter(|v| is_useful_value(v));
    Some(NodeRecord {
        parent,
        children: Vec::new(),
        runtime_id,
        automation_id,
        name,
        role: Some(control_type.to_string()),
        control_type_raw: control_type as i32,
        enabled,
        offscreen,
        rect,
        value,
        ancestor_chain: ancestors.to_vec(),
        depth,
    })
}

fn ancestor_label(record: &NodeRecord) -> String {
    let role = record.role.as_deref().unwrap_or("unknown");
    format!("{role}:{}", record.name)
}

struct OutlineEmit {
    text: String,
    visited: u32,
    emitted: u32,
    truncated: bool,
    truncation_reason: Option<String>,
}

fn emit_outline_from_arena(
    store: &SnapshotStore,
    hwnd: i64,
    generation: u32,
    process_id: u32,
    nodes: &[NodeRecord],
    root_idx: usize,
    max_depth: u32,
    max_elements: u32,
    force_children: bool,
) -> OutlineEmit {
    let mut lines = Vec::new();
    let mut char_count = 0usize;
    let mut next_index = 0u32;
    let mut emitted = 0u32;
    let mut visited = 0u32;
    let mut truncated = false;
    let mut truncation_reason = None;

    if root_idx >= nodes.len() {
        return OutlineEmit {
            text: String::new(),
            visited: 0,
            emitted: 0,
            truncated: false,
            truncation_reason: None,
        };
    }

    fn push_line(
        lines: &mut Vec<String>,
        char_count: &mut usize,
        truncated: &mut bool,
        truncation_reason: &mut Option<String>,
        line: String,
    ) -> bool {
        let extra = if lines.is_empty() {
            line.len()
        } else {
            line.len() + 1
        };
        if *char_count + extra > MAX_OUTLINE_CHARS {
            *truncated = true;
            *truncation_reason = Some("token_cap".to_string());
            return false;
        }
        *char_count += extra;
        lines.push(line);
        true
    }

    fn sibling_fingerprint(node: &NodeRecord) -> (i32, &str, bool, bool) {
        (
            node.control_type_raw,
            node.name.as_str(),
            node.enabled,
            node.offscreen,
        )
    }

    fn walk(
        store: &SnapshotStore,
        hwnd: i64,
        generation: u32,
        process_id: u32,
        nodes: &[NodeRecord],
        idx: usize,
        depth: u32,
        max_depth: u32,
        max_elements: u32,
        force_children: bool,
        lines: &mut Vec<String>,
        char_count: &mut usize,
        next_index: &mut u32,
        emitted: &mut u32,
        visited: &mut u32,
        truncated: &mut bool,
        truncation_reason: &mut Option<String>,
    ) {
        if matches!(
            truncation_reason.as_deref(),
            Some("token_cap" | "max_elements")
        ) {
            return;
        }
        if *emitted >= max_elements {
            *truncated = true;
            *truncation_reason = Some("max_elements".to_string());
            return;
        }
        *visited = visited.saturating_add(1);
        let node = &nodes[idx];
        let control_type = control_type_from_raw(node.control_type_raw);

        // Text stays in the arena for get_text, but is omitted from outline emission
        // (transparent: children keep the Text node's depth).
        if matches!(control_type, ControlType::Text) {
            for &child in &node.children {
                if matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                ) {
                    break;
                }
                walk(
                    store,
                    hwnd,
                    generation,
                    process_id,
                    nodes,
                    child as usize,
                    depth,
                    max_depth,
                    max_elements,
                    force_children,
                    lines,
                    char_count,
                    next_index,
                    emitted,
                    visited,
                    truncated,
                    truncation_reason,
                );
            }
            return;
        }

        let collapse = !force_children && should_collapse_control(control_type, depth);
        let interactive = is_interactive_control(control_type) || !node.name.trim().is_empty();

        if interactive || collapse {
            *next_index = next_index.saturating_add(1);
            let reference = make_reference(*next_index, generation, hwnd);
            store.store_element(
                hwnd,
                generation,
                reference.clone(),
                stored_from_record(hwnd, process_id, node),
            );
            let line = format_record_line(node, depth, &reference, None);
            if !push_line(lines, char_count, truncated, truncation_reason, line) {
                return;
            }
            *emitted = emitted.saturating_add(1);
        }

        if collapse {
            return;
        }
        if depth >= max_depth {
            if !node.children.is_empty() {
                *truncated = true;
                *truncation_reason = Some("max_depth".to_string());
            }
            return;
        }
        if *emitted >= max_elements {
            *truncated = true;
            *truncation_reason = Some("max_elements".to_string());
            return;
        }

        let children = &node.children;
        let mut i = 0usize;
        while i < children.len() {
            if matches!(
                truncation_reason.as_deref(),
                Some("token_cap" | "max_elements")
            ) {
                break;
            }
            if *emitted >= max_elements {
                let omit = format!(
                    "{:indent$}+more elements omitted",
                    "",
                    indent = (depth as usize + 1) * 2
                );
                let _ = push_line(lines, char_count, truncated, truncation_reason, omit);
                *truncated = true;
                *truncation_reason = Some("max_elements".to_string());
                break;
            }

            let fp = sibling_fingerprint(&nodes[children[i] as usize]);
            let mut run_end = i + 1;
            while run_end < children.len()
                && sibling_fingerprint(&nodes[children[run_end] as usize]) == fp
            {
                run_end += 1;
            }
            let run_len = run_end - i;
            let emit_count = run_len.min(SIBLING_FINGERPRINT_EMIT as usize);

            for j in 0..emit_count {
                if matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                ) || *emitted >= max_elements
                {
                    break;
                }
                walk(
                    store,
                    hwnd,
                    generation,
                    process_id,
                    nodes,
                    children[i + j] as usize,
                    depth + 1,
                    max_depth,
                    max_elements,
                    false,
                    lines,
                    char_count,
                    next_index,
                    emitted,
                    visited,
                    truncated,
                    truncation_reason,
                );
            }

            if run_len > emit_count
                && !matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                )
            {
                let n = run_len - emit_count;
                let compress = format!(
                    "{:indent$}+{n} more like this",
                    "",
                    indent = (depth as usize + 1) * 2
                );
                if push_line(lines, char_count, truncated, truncation_reason, compress) {
                    *truncated = true;
                    if truncation_reason.is_none()
                        || truncation_reason.as_deref() == Some("sibling_compress")
                    {
                        *truncation_reason = Some("sibling_compress".to_string());
                    }
                }
            }

            i = run_end;
        }
    }

    walk(
        store,
        hwnd,
        generation,
        process_id,
        nodes,
        root_idx,
        0,
        max_depth,
        max_elements,
        force_children,
        &mut lines,
        &mut char_count,
        &mut next_index,
        &mut emitted,
        &mut visited,
        &mut truncated,
        &mut truncation_reason,
    );

    OutlineEmit {
        text: lines.join("\n"),
        visited,
        emitted,
        truncated,
        truncation_reason,
    }
}

fn stored_from_record(hwnd: i64, process_id: u32, node: &NodeRecord) -> StoredElement {
    StoredElement {
        hwnd,
        runtime_id: node.runtime_id.clone(),
        process_id,
        name: node.name.clone(),
        role: node.role.clone(),
        automation_id: node.automation_id.clone(),
        rect: node.rect,
        ancestor_chain: node.ancestor_chain.clone(),
    }
}

fn format_record_line(
    node: &NodeRecord,
    depth: u32,
    reference: &str,
    match_tier: Option<&str>,
) -> String {
    let role = node.role.as_deref().unwrap_or("unknown");
    let name = node.name.replace('"', "'");
    let mut state: Vec<String> = Vec::new();
    if !node.enabled {
        state.push("disabled".to_string());
    }
    if node.offscreen {
        state.push("offscreen".to_string());
    }
    if let Some(value) = &node.value {
        state.push(format!("value=\"{}\"", value.replace('"', "'")));
    }
    if let Some(tier) = match_tier {
        state.push(format!("match={tier}"));
    }
    let state_suffix = if state.is_empty() {
        String::new()
    } else {
        format!(" [{}]", state.join(", "))
    };
    format!(
        "{:indent$}{reference} {role} \"{name}\"{state_suffix}",
        "",
        indent = depth as usize * 2
    )
}

fn control_type_from_raw(raw: i32) -> ControlType {
    // ControlType is repr(i32); fall back to Custom on unknown.
    match raw {
        x if x == ControlType::Button as i32 => ControlType::Button,
        x if x == ControlType::Edit as i32 => ControlType::Edit,
        x if x == ControlType::ComboBox as i32 => ControlType::ComboBox,
        x if x == ControlType::CheckBox as i32 => ControlType::CheckBox,
        x if x == ControlType::RadioButton as i32 => ControlType::RadioButton,
        x if x == ControlType::MenuItem as i32 => ControlType::MenuItem,
        x if x == ControlType::Hyperlink as i32 => ControlType::Hyperlink,
        x if x == ControlType::TabItem as i32 => ControlType::TabItem,
        x if x == ControlType::ListItem as i32 => ControlType::ListItem,
        x if x == ControlType::TreeItem as i32 => ControlType::TreeItem,
        x if x == ControlType::Slider as i32 => ControlType::Slider,
        x if x == ControlType::Spinner as i32 => ControlType::Spinner,
        x if x == ControlType::Document as i32 => ControlType::Document,
        x if x == ControlType::Pane as i32 => ControlType::Pane,
        x if x == ControlType::Window as i32 => ControlType::Window,
        x if x == ControlType::SplitButton as i32 => ControlType::SplitButton,
        x if x == ControlType::Text as i32 => ControlType::Text,
        x if x == ControlType::Image as i32 => ControlType::Image,
        x if x == ControlType::Separator as i32 => ControlType::Separator,
        x if x == ControlType::ToolTip as i32 => ControlType::ToolTip,
        x if x == ControlType::Group as i32 => ControlType::Group,
        _ => ControlType::Custom,
    }
}

pub fn click_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;
    let target = resolve_click_target(session, &element)?;
    prepare_for_click(&target)?;

    let control_type = target.get_control_type().unwrap_or(ControlType::Custom);

    // Edit/Document: patterns often advertise Invoke but fail ("Pattern not found").
    // Focus was already applied in prepare_for_click; synthetic click places the caret.
    if !matches!(control_type, ControlType::Edit | ControlType::Document) {
        if control_type == ControlType::Hyperlink {
            if let Some(result) = try_legacy_action(&target, foregrounded) {
                return result;
            }
            if let Some(result) = try_invoke(&target, foregrounded) {
                return result;
            }
            if let Some(result) = try_keyboard_enter(&target, foregrounded) {
                return result;
            }
        } else {
            if let Some(result) = try_invoke(&target, foregrounded) {
                return result;
            }
            if let Some(result) = try_toggle(&target, foregrounded) {
                return result;
            }
            if let Some(result) = try_legacy_action(&target, foregrounded) {
                return result;
            }
            if control_type == ControlType::ListItem {
                if let Some(result) = try_keyboard_enter(&target, foregrounded) {
                    return result;
                }
            }
        }
    }

    target
        .click()
        .map_err(|error| map_uia_error(error, ErrorCode::ClickFailed))?;
    Ok(ActionResult {
        ok: true,
        method: "synthetic_click".to_string(),
        foregrounded,
    })
}

fn prepare_for_click(element: &UIElement) -> Result<(), CommandError> {
    if let Ok(pattern) = element.get_pattern::<UIScrollItemPattern>() {
        let _ = pattern.scroll_into_view();
    }
    let _ = element.set_focus();
    Ok(())
}

fn resolve_click_target(
    session: &UiaSession,
    element: &UIElement,
) -> Result<UIElement, CommandError> {
    let mut chain = vec![element.clone()];
    let mut current = element.clone();
    for _ in 0..8 {
        match session
            .control_walker
            .get_parent_build_cache(&current, &session.live_cache)
        {
            Ok(parent) => {
                chain.push(parent.clone());
                current = parent;
            }
            Err(_) => break,
        }
    }

    for node in &chain {
        if node.get_control_type() == Ok(ControlType::Hyperlink) {
            return Ok(node.clone());
        }
    }

    for node in &chain {
        if is_preferred_click_target(node) {
            return Ok(node.clone());
        }
    }

    Ok(element.clone())
}

fn is_preferred_click_target(element: &UIElement) -> bool {
    if let Ok(control_type) = element.get_control_type() {
        if matches!(
            control_type,
            ControlType::Button
                | ControlType::MenuItem
                | ControlType::SplitButton
                | ControlType::ListItem
                | ControlType::TabItem
        ) {
            return true;
        }
    }
    element.get_pattern::<UIInvokePattern>().is_ok()
        || element.get_pattern::<UILegacyIAccessiblePattern>().is_ok()
}

fn try_invoke(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UIInvokePattern>().ok()?;
    match pattern.invoke() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "invoke".to_string(),
            foregrounded,
        })),
        Err(error) if is_recoverable_click_pattern_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, ErrorCode::ClickFailed))),
    }
}

fn try_toggle(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UITogglePattern>().ok()?;
    match pattern.toggle() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "toggle".to_string(),
            foregrounded,
        })),
        Err(error) if is_recoverable_click_pattern_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, ErrorCode::ClickFailed))),
    }
}

fn try_legacy_action(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UILegacyIAccessiblePattern>().ok()?;
    match pattern.do_default_action() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "legacy".to_string(),
            foregrounded,
        })),
        Err(error) if is_recoverable_click_pattern_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, ErrorCode::ClickFailed))),
    }
}

fn try_keyboard_enter(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    Some(
        element
            .set_focus()
            .and_then(|_| element.send_keys("{ENTER}", 10))
            .map(|_| ActionResult {
                ok: true,
                method: "enter".to_string(),
                foregrounded,
            })
            .map_err(|error| map_uia_error(error, ErrorCode::ClickFailed)),
    )
}

pub fn set_value_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
    text: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;

    if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
        pattern
            .set_value(text)
            .map_err(|error| map_uia_error(error, ErrorCode::SetValueFailed))?;
        return Ok(ActionResult {
            ok: true,
            method: "value_pattern".to_string(),
            foregrounded,
        });
    }

    if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
        pattern
            .set_value(text)
            .map_err(|error| map_uia_error(error, ErrorCode::SetValueFailed))?;
        return Ok(ActionResult {
            ok: true,
            method: "legacy".to_string(),
            foregrounded,
        });
    }

    element
        .set_focus()
        .map_err(|error| map_uia_error(error, ErrorCode::SetValueFailed))?;
    element
        .send_keys(text, 10)
        .map_err(|error| map_uia_error(error, ErrorCode::SetValueFailed))?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

pub fn send_keys_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    hwnd: i64,
    text: &str,
    reference: Option<&str>,
) -> Result<ActionResult, CommandError> {
    if text.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "text must not be empty",
        ));
    }

    let foregrounded = foreground_window(session, hwnd)?;
    let element = if let Some(ref_str) = reference {
        let stored = store.resolve_ref_or_stale(ref_str)?;
        if stored.hwnd != hwnd {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "reference does not belong to the provided hwnd",
            ));
        }
        resolve_stored_element(session, &stored)?
    } else {
        session
            .automation
            .element_from_handle(hwnd_from_i64(hwnd)?)
            .map_err(|error| map_uia_error(error, ErrorCode::SendKeysFailed))?
    };

    let _ = element.set_focus();
    element
        .send_keys(text, 10)
        .map_err(|error| map_uia_error(error, ErrorCode::SendKeysFailed))?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

pub fn focus_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;
    element
        .set_focus()
        .map_err(|error| map_uia_error(error, ErrorCode::FocusFailed))?;
    Ok(ActionResult {
        ok: true,
        method: "focus".to_string(),
        foregrounded,
    })
}

pub fn get_value_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<GetValueResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;

    if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
        if let Ok(value) = pattern.get_value() {
            if is_useful_value(&value) {
                return Ok(GetValueResult {
                    value,
                    kind: "text".to_string(),
                    min: None,
                    max: None,
                    method: "value_pattern".to_string(),
                });
            }
        }
    }

    if let Ok(pattern) = element.get_pattern::<UIRangeValuePattern>() {
        let value = pattern
            .get_value()
            .map_err(|error| map_uia_error(error, ErrorCode::GetValueFailed))?;
        let min = pattern.get_minimum().ok();
        let max = pattern.get_maximum().ok();
        return Ok(GetValueResult {
            value: value.to_string(),
            kind: "range".to_string(),
            min,
            max,
            method: "range_value".to_string(),
        });
    }

    if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
        if let Ok(value) = pattern.get_value() {
            if is_useful_value(&value) {
                return Ok(GetValueResult {
                    value,
                    kind: "text".to_string(),
                    min: None,
                    max: None,
                    method: "legacy".to_string(),
                });
            }
        }
    }

    Ok(GetValueResult {
        value: String::new(),
        kind: "empty".to_string(),
        min: None,
        max: None,
        method: "empty".to_string(),
    })
}

pub fn scroll_element_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
    direction: &str,
    amount: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;
    let (horizontal, vertical) = scroll_amounts(direction, amount)?;
    let target = find_scrollable_element(session, &element)?;

    target
        .get_pattern::<UIScrollPattern>()
        .map_err(|error| map_uia_error(error, ErrorCode::ScrollUnavailable))?
        .scroll(horizontal, vertical)
        .map_err(|error| map_uia_error(error, ErrorCode::ScrollFailed))?;

    Ok(ActionResult {
        ok: true,
        method: "scroll".to_string(),
        foregrounded,
    })
}

pub fn right_click_element_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;
    prepare_for_click(&element)?;
    element
        .right_click()
        .map_err(|error| map_uia_error(error, ErrorCode::RightClickFailed))?;
    Ok(ActionResult {
        ok: true,
        method: "right_click".to_string(),
        foregrounded,
    })
}

pub fn invoke_action_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
    action: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let foregrounded = foreground_window(session, stored.hwnd)?;
    let method = parse_invoke_action(action)?;

    match method {
        "press" => {
            let pattern = element.get_pattern::<UIInvokePattern>().map_err(|_| {
                CommandError::new(
                    ErrorCode::ActionUnavailable,
                    "Invoke pattern is not available on this element",
                )
            })?;
            pattern
                .invoke()
                .map_err(|error| map_uia_error(error, ErrorCode::InvokeActionFailed))?;
        }
        "toggle" => {
            let pattern = element.get_pattern::<UITogglePattern>().map_err(|_| {
                CommandError::new(
                    ErrorCode::ActionUnavailable,
                    "Toggle pattern is not available on this element",
                )
            })?;
            pattern
                .toggle()
                .map_err(|error| map_uia_error(error, ErrorCode::InvokeActionFailed))?;
        }
        "expand" => {
            let pattern = element
                .get_pattern::<UIExpandCollapsePattern>()
                .map_err(|_| {
                    CommandError::new(
                        ErrorCode::ActionUnavailable,
                        "ExpandCollapse pattern is not available on this element",
                    )
                })?;
            pattern
                .expand()
                .map_err(|error| map_uia_error(error, ErrorCode::InvokeActionFailed))?;
        }
        "collapse" => {
            let pattern = element
                .get_pattern::<UIExpandCollapsePattern>()
                .map_err(|_| {
                    CommandError::new(
                        ErrorCode::ActionUnavailable,
                        "ExpandCollapse pattern is not available on this element",
                    )
                })?;
            pattern
                .collapse()
                .map_err(|error| map_uia_error(error, ErrorCode::InvokeActionFailed))?;
        }
        "select" => {
            let pattern = element
                .get_pattern::<UISelectionItemPattern>()
                .map_err(|_| {
                    CommandError::new(
                        ErrorCode::ActionUnavailable,
                        "SelectionItem pattern is not available on this element",
                    )
                })?;
            pattern
                .select()
                .map_err(|error| map_uia_error(error, ErrorCode::InvokeActionFailed))?;
        }
        _ => {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Unknown action: {action}"),
            ));
        }
    }

    Ok(ActionResult {
        ok: true,
        method: method.to_string(),
        foregrounded,
    })
}

fn parse_invoke_action(action: &str) -> Result<&'static str, CommandError> {
    match action {
        "toggle" => Ok("toggle"),
        "expand" => Ok("expand"),
        "collapse" => Ok("collapse"),
        "press" => Ok("press"),
        "select" => Ok("select"),
        _ => Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("action must be one of toggle, expand, collapse, press, select; got {action}"),
        )),
    }
}

fn scroll_amounts(
    direction: &str,
    amount: &str,
) -> Result<(ScrollAmount, ScrollAmount), CommandError> {
    let step = match amount {
        "large" => "large",
        "small" | "" => "small",
        other => {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("amount must be small or large; got {other}"),
            ));
        }
    };

    let increment = if step == "large" {
        ScrollAmount::LargeIncrement
    } else {
        ScrollAmount::SmallIncrement
    };
    let decrement = if step == "large" {
        ScrollAmount::LargeDecrement
    } else {
        ScrollAmount::SmallDecrement
    };

    match direction {
        "up" => Ok((ScrollAmount::NoAmount, decrement)),
        "down" => Ok((ScrollAmount::NoAmount, increment)),
        "left" => Ok((decrement, ScrollAmount::NoAmount)),
        "right" => Ok((increment, ScrollAmount::NoAmount)),
        other => Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("direction must be up, down, left, or right; got {other}"),
        )),
    }
}

fn find_scrollable_element(
    session: &UiaSession,
    element: &UIElement,
) -> Result<UIElement, CommandError> {
    if element.get_pattern::<UIScrollPattern>().is_ok() {
        return Ok(element.clone());
    }

    let mut current = element.clone();
    for _ in 0..8 {
        match session
            .control_walker
            .get_parent_build_cache(&current, &session.live_cache)
        {
            Ok(parent) => {
                if parent.get_pattern::<UIScrollPattern>().is_ok() {
                    return Ok(parent);
                }
                current = parent;
            }
            Err(_) => break,
        }
    }

    Err(CommandError::new(
        ErrorCode::ScrollUnavailable,
        "No scrollable ancestor found for this element",
    ))
}

pub struct UiaSession {
    pub automation: UIAutomation,
    pub subtree_cache: uiautomation::core::UICacheRequest,
    pub children_cache: uiautomation::core::UICacheRequest,
    pub live_cache: uiautomation::core::UICacheRequest,
    pub control_walker: UITreeWalker,
}

impl UiaSession {
    /// Build the long-lived session on the a11y worker thread after COM is initialized.
    pub fn init_on_worker_thread() -> Result<Self, CommandError> {
        let automation = UIAutomation::new_direct()
            .map_err(|error| CommandError::new(ErrorCode::UiaInitFailed, error.to_string()))?;
        configure_timeouts(&automation);

        let subtree_cache =
            build_cache_request(&automation, TreeScope::Subtree, ElementMode::None, true)?;
        let children_cache =
            build_cache_request(&automation, TreeScope::Element, ElementMode::None, true)?;
        let live_cache =
            build_cache_request(&automation, TreeScope::Element, ElementMode::Full, false)?;

        let control_walker = automation
            .get_control_view_walker()
            .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;

        Ok(Self {
            automation,
            subtree_cache,
            children_cache,
            live_cache,
            control_walker,
        })
    }
}

fn build_cache_request(
    automation: &UIAutomation,
    scope: TreeScope,
    mode: ElementMode,
    include_process_id: bool,
) -> Result<uiautomation::core::UICacheRequest, CommandError> {
    let cache_request = automation
        .create_cache_request()
        .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;
    cache_request
        .set_tree_scope(scope)
        .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;
    cache_request
        .set_element_mode(mode)
        .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;

    let mut properties = vec![
        UIProperty::Name,
        UIProperty::ControlType,
        UIProperty::AutomationId,
        UIProperty::IsEnabled,
        UIProperty::IsOffscreen,
        UIProperty::BoundingRectangle,
        UIProperty::ValueValue,
        UIProperty::RuntimeId,
        UIProperty::IsInvokePatternAvailable,
        UIProperty::IsValuePatternAvailable,
        UIProperty::IsTogglePatternAvailable,
        UIProperty::IsLegacyIAccessiblePatternAvailable,
    ];
    if include_process_id {
        properties.push(UIProperty::ProcessId);
    }
    for property in properties {
        cache_request
            .add_property(property)
            .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;
    }
    for pattern in [
        UIPatternType::Invoke,
        UIPatternType::Value,
        UIPatternType::Toggle,
        UIPatternType::LegacyIAccessible,
    ] {
        cache_request
            .add_pattern(pattern)
            .map_err(|error| map_uia_error(error, ErrorCode::UiaInitFailed))?;
    }
    Ok(cache_request)
}

fn configure_timeouts(automation: &UIAutomation) {
    use windows::core::Interface;
    use windows::Win32::UI::Accessibility::IUIAutomation2;

    if let Ok(automation2) = automation.as_ref().cast::<IUIAutomation2>() {
        unsafe {
            let _ = automation2.SetConnectionTimeout(CONNECTION_TIMEOUT_MS);
            let _ = automation2.SetTransactionTimeout(TRANSACTION_TIMEOUT_MS);
        }
    }
}

fn element_name(element: &UIElement) -> String {
    element
        .get_cached_name()
        .or_else(|_| element.get_name())
        .unwrap_or_default()
}

fn element_automation_id(element: &UIElement) -> String {
    element
        .get_cached_automation_id()
        .or_else(|_| element.get_automation_id())
        .unwrap_or_default()
}

fn element_control_type(element: &UIElement) -> Result<ControlType, uiautomation::Error> {
    element
        .get_cached_control_type()
        .or_else(|_| element.get_control_type())
}

fn element_is_enabled(element: &UIElement) -> Option<bool> {
    element
        .is_cached_enabled()
        .or_else(|_| element.is_enabled())
        .ok()
}

fn element_is_offscreen(element: &UIElement) -> Option<bool> {
    element
        .is_cached_offscreen()
        .or_else(|_| element.is_offscreen())
        .ok()
}

fn element_value_text(element: &UIElement) -> Option<String> {
    element
        .get_cached_property_value(UIProperty::ValueValue)
        .or_else(|_| element.get_property_value(UIProperty::ValueValue))
        .ok()
        .map(|value| value.to_string())
}

fn element_rect(element: &UIElement) -> Option<(i32, i32, i32, i32)> {
    let rect = element
        .get_cached_bounding_rectangle()
        .or_else(|_| element.get_bounding_rectangle())
        .ok()?;
    Some((
        rect.get_left(),
        rect.get_top(),
        rect.get_right(),
        rect.get_bottom(),
    ))
}

fn element_runtime_id(element: &UIElement) -> Result<Vec<i32>, uiautomation::Error> {
    if let Ok(variant) = element.get_cached_property_value(UIProperty::RuntimeId) {
        if let Ok(ids) = runtime_id_from_variant(&variant) {
            return Ok(ids);
        }
    }
    element.get_runtime_id()
}

fn runtime_id_from_variant(variant: &Variant) -> Result<Vec<i32>, uiautomation::Error> {
    match TryInto::<Value>::try_into(variant)? {
        Value::ArrayI4(ids) => Ok(ids),
        Value::SAFEARRAY(arr) => arr.try_into(),
        _ => {
            let arr = variant.get_array()?;
            arr.try_into()
        }
    }
}

fn resolve_stored_element(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<UIElement, CommandError> {
    Ok(resolve_stored_element_with_stats(session, stored)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct ResolveStats {
    pub nodes_visited: u32,
}

/// Resolve a stored reference and return visit stats (for a11y-bench).
#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn resolve_reference_with_stats(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
) -> Result<ResolveStats, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    Ok(resolve_stored_element_with_stats(session, &stored)?.1)
}

fn resolve_stored_element_with_stats(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<(UIElement, ResolveStats), CommandError> {
    let mut last_error: Option<CommandError> = None;
    for attempt in 0..RESOLVE_RETRY_ATTEMPTS {
        match resolve_stored_element_once(session, stored) {
            Ok(result) => return Ok(result),
            Err(error)
                if is_transient_command_error(&error) && attempt + 1 < RESOLVE_RETRY_ATTEMPTS =>
            {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(
                    TRANSIENT_UIA_RETRY_MS * (attempt as u64 + 1),
                ));
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        CommandError::new(
            ErrorCode::ResolveFailed,
            "Failed to resolve accessibility element",
        )
    }))
}

fn resolve_stored_element_once(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<(UIElement, ResolveStats), CommandError> {
    let handle = hwnd_from_i64(stored.hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.live_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::ResolveFailed))?;

    if let Some(element) = find_by_runtime_id(session, &root, &stored.runtime_id)? {
        return Ok((element, ResolveStats { nodes_visited: 1 }));
    }

    resolve_element_by_fingerprint(session, stored, &root)
}

fn resolve_element_by_fingerprint(
    session: &UiaSession,
    stored: &StoredElement,
    window: &UIElement,
) -> Result<(UIElement, ResolveStats), CommandError> {
    if stored.name.trim().is_empty() && stored.automation_id.is_empty() {
        return Err(CommandError::new(ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        ));
    }

    let condition = if !stored.automation_id.is_empty() {
        session
            .automation
            .create_property_condition(
                UIProperty::AutomationId,
                Variant::from(stored.automation_id.as_str()),
                None,
            )
            .map_err(|error| map_uia_error(error, ErrorCode::ResolveFailed))?
    } else if let Some(role) = stored.role.as_deref().and_then(parse_role_label) {
        session
            .automation
            .create_property_condition(UIProperty::ControlType, Variant::from(role as i32), None)
            .map_err(|error| map_uia_error(error, ErrorCode::ResolveFailed))?
    } else {
        session
            .automation
            .create_true_condition()
            .map_err(|error| map_uia_error(error, ErrorCode::ResolveFailed))?
    };

    let candidates = match window.find_all_build_cache(
        TreeScope::Descendants,
        &condition,
        &session.live_cache,
    ) {
        Ok(elements) => elements,
        Err(error) if error.code() == ERR_NOTFOUND => Vec::new(),
        Err(error) => return Err(map_uia_error(error, ErrorCode::ResolveFailed)),
    };

    let mut scored: Vec<(i32, UIElement)> = Vec::new();
    for element in candidates {
        let score = fingerprint_score(session, stored, &element);
        if score > 0 {
            scored.push((score, element));
        }
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0));

    match scored.as_slice() {
        [] => Err(CommandError::new(ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        )),
        [(_best_score, element)] => Ok((
            element.clone(),
            ResolveStats {
                nodes_visited: 1,
            },
        )),
        [(best_score, element), (second, _), ..] if *best_score > *second => Ok((
            element.clone(),
            ResolveStats {
                nodes_visited: 1,
            },
        )),
        _ => Err(CommandError::new(ErrorCode::AmbiguousReference,
            "Multiple elements match the stored fingerprint; take a new snapshot",
        )),
    }
}

fn fingerprint_score(session: &UiaSession, stored: &StoredElement, element: &UIElement) -> i32 {
    let mut score = 0i32;
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let role = element_control_type(element).ok().map(|c| c.to_string());
    let rect = element_rect(element);

    if !stored.automation_id.is_empty() && stored.automation_id == automation_id {
        score += 100;
    }
    if !stored.name.is_empty() && stored.name == name {
        score += 40;
    } else if !stored.name.is_empty()
        && name
            .to_ascii_lowercase()
            .contains(&stored.name.to_ascii_lowercase())
    {
        score += 15;
    }
    if stored.role.is_some() && stored.role == role {
        score += 25;
    }
    if let (Some(a), Some(b)) = (stored.rect, rect) {
        let overlap = rect_overlap_score(a, b);
        score += overlap;
    }
    if !stored.ancestor_chain.is_empty() {
        let live_chain = collect_ancestor_labels(session, element, stored.ancestor_chain.len());
        let common = stored
            .ancestor_chain
            .iter()
            .rev()
            .zip(live_chain.iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        score += (common as i32) * 12;
    }
    score
}

fn collect_ancestor_labels(
    session: &UiaSession,
    element: &UIElement,
    max_len: usize,
) -> Vec<String> {
    let mut chain = Vec::new();
    let mut current = element.clone();
    for _ in 0..max_len.saturating_add(2).min(24) {
        match session
            .control_walker
            .get_parent_build_cache(&current, &session.live_cache)
        {
            Ok(parent) => {
                let label = format!(
                    "{}:{}",
                    element_control_type(&parent)
                        .map(|c| c.to_string())
                        .unwrap_or_else(|_| "Unknown".to_string()),
                    element_name(&parent)
                );
                chain.push(label);
                current = parent;
            }
            Err(_) => break,
        }
    }
    chain.reverse();
    if chain.len() > max_len {
        chain = chain[chain.len() - max_len..].to_vec();
    }
    chain
}

fn rect_overlap_score(a: (i32, i32, i32, i32), b: (i32, i32, i32, i32)) -> i32 {
    let (al, at, ar, ab) = a;
    let (bl, bt, br, bb) = b;
    let ix = (ar.min(br)).saturating_sub(al.max(bl)).max(0);
    let iy = (ab.min(bb)).saturating_sub(at.max(bt)).max(0);
    if ix == 0 || iy == 0 {
        // Center distance fallback
        let acx = (al + ar) / 2;
        let acy = (at + ab) / 2;
        let bcx = (bl + br) / 2;
        let bcy = (bt + bb) / 2;
        let dist = ((acx - bcx).abs() + (acy - bcy).abs()) as i32;
        if dist < 20 {
            10
        } else if dist < 80 {
            3
        } else {
            0
        }
    } else {
        20
    }
}

fn parse_role_label(role: &str) -> Option<ControlType> {
    parse_role(role).ok()
}

fn find_by_runtime_id(
    session: &UiaSession,
    root: &UIElement,
    target: &[i32],
) -> Result<Option<UIElement>, CommandError> {
    if target.is_empty() {
        return Ok(None);
    }

    let variant = Variant::from(Value::ArrayI4(target.to_vec()));
    let condition = session
        .automation
        .create_property_condition(UIProperty::RuntimeId, variant, None)
        .map_err(|error| map_uia_error(error, ErrorCode::ResolveFailed))?;

    match root.find_first_build_cache(TreeScope::Subtree, &condition, &session.live_cache) {
        Ok(element) => Ok(Some(element)),
        Err(error) if error.code() == ERR_NOTFOUND => Ok(None),
        Err(error) => Err(map_uia_error(error, ErrorCode::ResolveFailed)),
    }
}

fn foreground_window(session: &UiaSession, hwnd: i64) -> Result<bool, CommandError> {
    let handle = hwnd_from_i64(hwnd)?;
    let element = session
        .automation
        .element_from_handle(handle)
        .map_err(|error| map_uia_error(error, ErrorCode::FocusDenied))?;
    let window = WindowControl::try_from(&element)
        .map_err(|error| map_uia_error(error, ErrorCode::FocusDenied))?;
    window.set_foregrand().map_err(|_| {
        CommandError::new(
            ErrorCode::FocusDenied,
            "Could not bring target window to foreground",
        )
    })
}

fn parse_role(role: &str) -> Result<ControlType, CommandError> {
    match role.trim().to_ascii_lowercase().as_str() {
        "button" => Ok(ControlType::Button),
        "edit" | "textbox" | "textfield" => Ok(ControlType::Edit),
        "combobox" | "select" => Ok(ControlType::ComboBox),
        "checkbox" => Ok(ControlType::CheckBox),
        "radiobutton" | "radio" => Ok(ControlType::RadioButton),
        "menuitem" => Ok(ControlType::MenuItem),
        // Agents often say "link"; UIA control type is Hyperlink.
        "hyperlink" | "link" | "a" => Ok(ControlType::Hyperlink),
        "tabitem" | "tab" => Ok(ControlType::TabItem),
        "listitem" | "option" => Ok(ControlType::ListItem),
        "treeitem" => Ok(ControlType::TreeItem),
        "slider" => Ok(ControlType::Slider),
        "spinner" => Ok(ControlType::Spinner),
        "document" => Ok(ControlType::Document),
        "pane" => Ok(ControlType::Pane),
        "window" => Ok(ControlType::Window),
        other => Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("Unsupported role filter: {other}"),
        )),
    }
}

fn is_interactive_control(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Button
            | ControlType::Edit
            | ControlType::ComboBox
            | ControlType::CheckBox
            | ControlType::RadioButton
            | ControlType::MenuItem
            | ControlType::Hyperlink
            | ControlType::TabItem
            | ControlType::ListItem
            | ControlType::TreeItem
            | ControlType::Slider
            | ControlType::Spinner
            | ControlType::SplitButton
    )
}

/// Shallow Document/Pane nodes hold Chromium web content — always descend into them.
/// Only collapse deep structural panes to limit token use.
fn should_collapse_control(control_type: ControlType, depth: u32) -> bool {
    matches!(control_type, ControlType::Pane) && depth >= 6
}

fn is_useful_value(value_text: &str) -> bool {
    if value_text.is_empty() || value_text == "EMPTY" {
        return false;
    }
    !(value_text.starts_with("STRING(")
        || value_text.starts_with("INT(")
        || value_text.starts_with("BOOL("))
}

fn should_skip_control(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Text | ControlType::Image | ControlType::Separator | ControlType::ToolTip
    )
}

fn hwnd_from_i64(hwnd: i64) -> Result<Handle, CommandError> {
    if hwnd == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle must not be zero",
        ));
    }
    Ok(Handle::from(HWND(hwnd as isize as *mut _)))
}

fn map_uia_error(error: uiautomation::Error, code: ErrorCode) -> CommandError {
    if let Some(result) = error.result() {
        if result.0 == windows::Win32::Foundation::E_ACCESSDENIED.0 {
            return CommandError::new(
                ErrorCode::ElevationRequired,
                "Target window is elevated or otherwise inaccessible",
            );
        }
    }
    CommandError::new(code, error.to_string())
}

fn is_transaction_timeout(error: &uiautomation::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    message.contains("timeout") || message.contains("timed out")
}

fn is_transient_subscriber_error(error: &uiautomation::Error) -> bool {
    const EVENT_E_ALL_SUBSCRIBERS_FAILED: i32 = -2147220991;
    error.code() == EVENT_E_ALL_SUBSCRIBERS_FAILED
        || error
            .message()
            .to_ascii_lowercase()
            .contains("unable to invoke any of the subscribers")
}

/// Pattern advertised but unusable (common on Chromium Edit/omnibox) — fall through to next click strategy.
fn is_recoverable_click_pattern_error(error: &uiautomation::Error) -> bool {
    if is_transient_subscriber_error(error) {
        return true;
    }
    let message = error.message().to_ascii_lowercase();
    message.contains("pattern not found")
        || message.contains("pattern is not supported")
        || message.contains("does not support the")
}

fn is_transient_command_error(error: &CommandError) -> bool {
    error
        .message
        .to_ascii_lowercase()
        .contains("unable to invoke any of the subscribers")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interactive_control_detection() {
        assert!(is_interactive_control(ControlType::Button));
        assert!(!is_interactive_control(ControlType::Pane));
    }

    #[test]
    fn browser_content_nodes_are_not_collapsed() {
        assert!(!should_collapse_control(ControlType::Document, 0));
        assert!(!should_collapse_control(ControlType::Pane, 0));
        assert!(!should_collapse_control(ControlType::Pane, 3));
        assert!(should_collapse_control(ControlType::Pane, 6));
    }

    #[test]
    fn placeholder_values_are_filtered() {
        assert!(!is_useful_value("STRING()"));
        assert!(is_useful_value("hello"));
    }

    #[test]
    fn detects_transient_subscriber_errors() {
        let error = uiautomation::Error::new(
            -2147220991,
            "An event was unable to invoke any of the subscribers",
        );
        assert!(is_transient_subscriber_error(&error));
        assert!(is_transient_command_error(&CommandError::new(
            ErrorCode::ResolveFailed,
            "An event was unable to invoke any of the subscribers"
        )));
    }

    #[test]
    fn recovers_from_pattern_not_found_on_click() {
        let error = uiautomation::Error::new(0, "Pattern not found");
        assert!(is_recoverable_click_pattern_error(&error));
        let other = uiautomation::Error::new(0, "Access is denied");
        assert!(!is_recoverable_click_pattern_error(&other));
    }

    #[test]
    fn parse_role_accepts_common_aliases() {
        assert_eq!(parse_role("link").unwrap(), ControlType::Hyperlink);
        assert_eq!(parse_role("Hyperlink").unwrap(), ControlType::Hyperlink);
        assert_eq!(parse_role("textbox").unwrap(), ControlType::Edit);
        assert_eq!(parse_role("tab").unwrap(), ControlType::TabItem);
        assert!(parse_role("banana").is_err());
    }

    #[test]
    fn maps_scroll_amounts() {
        let (h, v) = scroll_amounts("down", "small").expect("down small");
        assert_eq!(h, ScrollAmount::NoAmount);
        assert_eq!(v, ScrollAmount::SmallIncrement);

        let (h, v) = scroll_amounts("up", "large").expect("up large");
        assert_eq!(h, ScrollAmount::NoAmount);
        assert_eq!(v, ScrollAmount::LargeDecrement);

        let (h, v) = scroll_amounts("left", "small").expect("left small");
        assert_eq!(h, ScrollAmount::SmallDecrement);
        assert_eq!(v, ScrollAmount::NoAmount);

        assert!(scroll_amounts("diagonal", "small").is_err());
        assert!(scroll_amounts("down", "huge").is_err());
    }

    #[test]
    fn parses_invoke_actions() {
        assert_eq!(parse_invoke_action("press").unwrap(), "press");
        assert_eq!(parse_invoke_action("toggle").unwrap(), "toggle");
        assert!(parse_invoke_action("click").is_err());
    }

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
    fn snapshot_input_clamps_bounds() {
        let input = SnapshotInput {
            hwnd: Some(1),
            reference: None,
            max_depth: 100,
            max_elements: 999,
        }
        .clamped();
        assert_eq!(input.max_depth, 20);
        assert_eq!(input.max_elements, 300);
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

    #[test]
    fn arena_collects_text_descendant_names() {
        let nodes = vec![
            NodeRecord {
                parent: None,
                children: vec![1, 2],
                runtime_id: vec![1],
                automation_id: String::new(),
                name: "Dialog".to_string(),
                role: Some("Pane".to_string()),
                control_type_raw: ControlType::Pane as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec![],
                depth: 0,
            },
            NodeRecord {
                parent: Some(0),
                children: vec![],
                runtime_id: vec![2],
                automation_id: String::new(),
                name: "Are you sure?".to_string(),
                role: Some("Text".to_string()),
                control_type_raw: ControlType::Text as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec!["Pane:Dialog".to_string()],
                depth: 1,
            },
            NodeRecord {
                parent: Some(0),
                children: vec![],
                runtime_id: vec![3],
                automation_id: String::new(),
                name: "OK".to_string(),
                role: Some("Button".to_string()),
                control_type_raw: ControlType::Button as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec!["Pane:Dialog".to_string()],
                depth: 1,
            },
        ];
        let names = collect_text_names_from_arena(&nodes, 0);
        assert_eq!(names, vec!["Are you sure?".to_string()]);
    }
}
