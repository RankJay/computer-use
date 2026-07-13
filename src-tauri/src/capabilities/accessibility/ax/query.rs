//! Find / query / wait over AX trees using portable match helpers.

use std::collections::HashSet;
use std::thread;
use std::time::{Duration, Instant};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::arena::{ElementArena, NodeRecord};
use super::super::budget::FIND_MAX_NODES;
use super::super::outline::{format_record_line, stored_from_record, CT_DOCUMENT, CT_TEXT};
use super::super::query_match::{find_record_priority, parse_role_raw, select_query_matches};
use super::super::state::{make_reference, SnapshotStore};
use super::super::types::{
    FindElementInput, QueryInput, TextResult, MAX_FIND_CANDIDATES, WAIT_POLL_MS,
};
use super::resolve::resolve_stored_element;
use super::session::{ax_window_for_info, lookup_cg_window, AxSession};
use super::tree_extract::collect_descendants;

pub(super) fn find_element_impl(
    session: &AxSession,
    arenas: &std::collections::HashMap<WindowId, ElementArena>,
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
    session: &AxSession,
    arenas: &std::collections::HashMap<WindowId, ElementArena>,
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
    session: &AxSession,
    arenas: &std::collections::HashMap<WindowId, ElementArena>,
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
    session: &AxSession,
    arenas: &std::collections::HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: &QueryInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    let info = lookup_cg_window(input.hwnd).map_err(|_| {
        CommandError::new(
            ErrorCode::FindFailed,
            "Could not resolve process id for hwnd",
        )
    })?;
    let process_id = info.pid;

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
    let role_filter = input.role.as_deref().map(parse_role_raw).transpose()?;
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
        resolve_stored_element(session, &stored, &info, deadline)?
    } else {
        ax_window_for_info(&info).map_err(|error| {
            if error.code == ErrorCode::AccessibilityPermissionDenied.as_str()
                || error.code == ErrorCode::InvalidHwnd.as_str()
            {
                error
            } else {
                CommandError::new(ErrorCode::FindFailed, error.message)
            }
        })?
    };

    let live_records: Vec<(usize, NodeRecord)> =
        collect_descendants(&root, FIND_MAX_NODES, deadline)
            .into_iter()
            .enumerate()
            .filter(|(_, record)| record.control_type_raw != CT_TEXT)
            .map(|(order, record)| {
                let mut record = record;
                enrich_record_from_arena(arenas.get(&input.hwnd), &mut record);
                (order, record)
            })
            .collect();

    let scope_depth = scope_depth_from_arena(
        arenas.get(&input.hwnd),
        store,
        input.scope_reference.as_deref(),
    );

    let search_records = prefer_document_scope(&live_records);
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
