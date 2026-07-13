//! Resolve stored refs back to live AXUIElement handles.

use std::thread;
use std::time::Duration;

use objc2_application_services::AXUIElement;
use objc2_core_foundation::CFRetained;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::outline::{format_record_line, stored_from_record};
use super::super::state::{make_reference, SnapshotStore, StoredElement};
use super::super::types::TextResult;
use super::roles::map_ax_role;
use super::session::{
    ax_window_for_hwnd, element_automation_id, element_cg_window_id, element_name, element_parent,
    element_pid, element_rect, element_role, is_transient_command_error, process_id_for_hwnd,
    AxSession, RESOLVE_RETRY_ATTEMPTS, TRANSIENT_AX_RETRY_MS,
};
use super::tree_extract::{project_element_allow_text, walk_path};

pub(super) fn resolve_stored_element(
    _session: &AxSession,
    stored: &StoredElement,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    Ok(resolve_stored_element_with_stats(stored)?.0)
}

fn resolve_stored_element_with_stats(
    stored: &StoredElement,
) -> Result<(CFRetained<AXUIElement>, ResolveStats), CommandError> {
    let mut last_error: Option<CommandError> = None;
    for attempt in 0..RESOLVE_RETRY_ATTEMPTS {
        match resolve_stored_element_once(stored) {
            Ok(result) => return Ok(result),
            Err(error)
                if is_transient_command_error(&error) && attempt + 1 < RESOLVE_RETRY_ATTEMPTS =>
            {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(
                    TRANSIENT_AX_RETRY_MS * (attempt as u64 + 1),
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
    stored: &StoredElement,
) -> Result<(CFRetained<AXUIElement>, ResolveStats), CommandError> {
    let root = ax_window_for_hwnd(stored.hwnd).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str()
            || error.code == ErrorCode::InvalidHwnd.as_str()
        {
            error
        } else {
            CommandError::new(ErrorCode::ResolveFailed, error.message)
        }
    })?;

    if !stored.runtime_id.is_empty() {
        if let Some(element) = walk_path(&root, &stored.runtime_id) {
            return Ok((element, ResolveStats { nodes_visited: 1 }));
        }
    }

    resolve_element_by_fingerprint(stored, &root)
}

fn resolve_element_by_fingerprint(
    stored: &StoredElement,
    window: &AXUIElement,
) -> Result<(CFRetained<AXUIElement>, ResolveStats), CommandError> {
    if stored.name.trim().is_empty() && stored.automation_id.is_empty() {
        return Err(CommandError::new(
            ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        ));
    }

    let mut scored: Vec<(i32, CFRetained<AXUIElement>)> = Vec::new();
    let mut stack = vec![CFRetained::from(window)];
    let mut visited = 0u32;
    while let Some(element) = stack.pop() {
        visited = visited.saturating_add(1);
        if visited > 8_000 {
            break;
        }
        let score = fingerprint_score(stored, &element);
        if score > 0 {
            scored.push((score, element.clone()));
        }
        for child in super::session::element_children(&element) {
            stack.push(child);
        }
    }
    scored.sort_by_key(|b| std::cmp::Reverse(b.0));

    match scored.as_slice() {
        [] => Err(CommandError::new(
            ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        )),
        [(_best, element)] => Ok((
            element.clone(),
            ResolveStats {
                nodes_visited: visited,
            },
        )),
        [(best, element), (second, _), ..] if *best > *second => Ok((
            element.clone(),
            ResolveStats {
                nodes_visited: visited,
            },
        )),
        _ => Err(CommandError::new(
            ErrorCode::AmbiguousReference,
            "Multiple elements match the stored fingerprint; take a new snapshot",
        )),
    }
}

fn fingerprint_score(stored: &StoredElement, element: &AXUIElement) -> i32 {
    let mut score = 0i32;
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let ax_role = element_role(element);
    let (_, label) = map_ax_role(&ax_role);
    let role = Some(label.to_string());
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
        score += rect_overlap_score(a, b);
    }
    if !stored.ancestor_chain.is_empty() {
        let live_chain = collect_ancestor_labels(element, stored.ancestor_chain.len());
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

fn collect_ancestor_labels(element: &AXUIElement, max_len: usize) -> Vec<String> {
    let mut chain = Vec::new();
    let mut current = CFRetained::from(element);
    for _ in 0..max_len.saturating_add(2).min(24) {
        match element_parent(&current) {
            Some(parent) => {
                let ax_role = element_role(&parent);
                let (_, label) = map_ax_role(&ax_role);
                chain.push(format!("{}:{}", label, element_name(&parent)));
                current = parent;
            }
            None => break,
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
        let acx = (al + ar) / 2;
        let acy = (at + ab) / 2;
        let bcx = (bl + br) / 2;
        let bcy = (bt + bb) / 2;
        let dist = (acx - bcx).abs() + (acy - bcy).abs();
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

pub(super) fn mint_projected_element(
    store: &SnapshotStore,
    hwnd: WindowId,
    element: &AXUIElement,
) -> Result<TextResult, CommandError> {
    let process_id = process_id_for_hwnd(hwnd)
        .or_else(|| element_pid(element))
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ResolveFailed,
                "Could not resolve process id for element",
            )
        })?;

    let record = project_element_allow_text(element, None, 0, &[], &[]).ok_or_else(|| {
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

pub(super) fn resolve_element_hwnd(
    element: &AXUIElement,
    preferred: Option<WindowId>,
) -> Result<WindowId, CommandError> {
    if let Some(hwnd) = preferred {
        if hwnd.0 <= 0 {
            return Err(CommandError::new(
                ErrorCode::InvalidHwnd,
                "Window handle must be positive",
            ));
        }
        return Ok(hwnd);
    }

    if let Some(cg_id) = element_cg_window_id(element) {
        return Ok(WindowId(cg_id as i64));
    }

    Err(CommandError::new(
        ErrorCode::ResolveFailed,
        "Could not resolve window handle for element",
    ))
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct ResolveStats {
    pub nodes_visited: u32,
}
