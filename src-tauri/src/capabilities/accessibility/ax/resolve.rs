//! Resolve stored refs back to live AXUIElement handles.

use std::thread;
use std::time::{Duration, Instant};

use objc2_application_services::AXUIElement;
use objc2_core_foundation::CFRetained;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::budget::{SearchBudget, RESOLVE_MAX_NODES};
use super::super::outline::{format_record_line, stored_from_record};
use super::super::state::{make_reference, SnapshotStore, StoredElement};
use super::super::types::TextResult;
use super::roles::map_ax_role;
use super::session::{
    ax_window_for_hwnd, element_ancestor_hop, element_cg_window_id, element_node_attrs,
    element_parent, element_pid, is_transient_command_error, process_id_for_hwnd, AxSession,
    NodeAttrs, RESOLVE_RETRY_ATTEMPTS, TRANSIENT_AX_RETRY_MS,
};
use super::tree_extract::{project_element_allow_text, walk_path};

pub(super) fn resolve_stored_element(
    _session: &AxSession,
    stored: &StoredElement,
    deadline: Instant,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    Ok(resolve_stored_element_with_stats(stored, deadline)?.0)
}

fn resolve_stored_element_with_stats(
    stored: &StoredElement,
    deadline: Instant,
) -> Result<(CFRetained<AXUIElement>, ResolveStats), CommandError> {
    let mut last_error: Option<CommandError> = None;
    for attempt in 0..RESOLVE_RETRY_ATTEMPTS {
        match resolve_stored_element_once(stored, deadline) {
            Ok(result) => return Ok(result),
            Err(error)
                if is_transient_command_error(&error) && attempt + 1 < RESOLVE_RETRY_ATTEMPTS =>
            {
                let backoff = Duration::from_millis(TRANSIENT_AX_RETRY_MS * (attempt as u64 + 1));
                if !backoff_fits_before_deadline(Instant::now(), deadline, backoff) {
                    return Err(error);
                }
                last_error = Some(error);
                thread::sleep(backoff);
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

/// True when sleeping `backoff` still leaves time before `deadline`.
fn backoff_fits_before_deadline(now: Instant, deadline: Instant, backoff: Duration) -> bool {
    now.checked_add(backoff).is_some_and(|wake| wake < deadline)
}

fn resolve_stored_element_once(
    stored: &StoredElement,
    deadline: Instant,
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

    let mut budget = SearchBudget::until(deadline, RESOLVE_MAX_NODES);
    resolve_element_by_fingerprint(stored, &root, &mut budget)
}

fn resolve_element_by_fingerprint(
    stored: &StoredElement,
    window: &AXUIElement,
    budget: &mut SearchBudget,
) -> Result<(CFRetained<AXUIElement>, ResolveStats), CommandError> {
    if stored.name.trim().is_empty() && stored.automation_id.is_empty() {
        return Err(CommandError::new(
            ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        ));
    }

    let mut scored: Vec<(i32, CFRetained<AXUIElement>)> = Vec::new();
    let mut stack = vec![CFRetained::from(window)];
    while let Some(element) = stack.pop() {
        if !budget.visit_soft() {
            break;
        }
        let attrs = element_node_attrs(&element);
        if fingerprint_prescreen(stored, &attrs) {
            let score = fingerprint_score_base(stored, &attrs);
            if score > 0 {
                scored.push((score, element));
            }
        }
        for child in attrs.children {
            stack.push(child);
        }
    }

    if !stored.ancestor_chain.is_empty() {
        for (score, element) in &mut scored {
            *score = score.saturating_add(ancestor_chain_bonus(stored, element));
        }
    }
    scored.sort_by_key(|b| std::cmp::Reverse(b.0));

    let nodes_visited = budget.nodes_visited();
    match scored.as_slice() {
        [] => Err(CommandError::new(
            ErrorCode::StaleReference,
            "Element no longer exists in the target window; take a new snapshot or find_element call",
        )),
        [(_best, element)] => Ok((
            element.clone(),
            ResolveStats { nodes_visited },
        )),
        [(best, element), (second, _), ..] if *best > *second => Ok((
            element.clone(),
            ResolveStats { nodes_visited },
        )),
        _ => Err(CommandError::new(
            ErrorCode::AmbiguousReference,
            "Multiple elements match the stored fingerprint; take a new snapshot",
        )),
    }
}

/// Role / automation-id gate before name+rect scoring.
///
/// With batched [`element_node_attrs`], pruning avoids ancestor climbs (second pass)
/// and keeps non-matching roles out of the candidate list. Automation id still wins
/// over a role mismatch when present.
fn fingerprint_prescreen(stored: &StoredElement, attrs: &NodeAttrs) -> bool {
    let (_, label) = map_ax_role(&attrs.role);
    let role_mismatch = stored
        .role
        .as_ref()
        .is_some_and(|expected| expected.as_str() != label);

    if role_mismatch && stored.automation_id.is_empty() {
        return false;
    }

    if !stored.automation_id.is_empty() {
        let id_mismatch = stored.automation_id != attrs.automation_id;
        if id_mismatch && role_mismatch {
            return false;
        }
    }

    true
}

fn fingerprint_score_base(stored: &StoredElement, attrs: &NodeAttrs) -> i32 {
    let mut score = 0i32;
    let (_, label) = map_ax_role(&attrs.role);
    let role = Some(label.to_string());

    if !stored.automation_id.is_empty() && stored.automation_id == attrs.automation_id {
        score += 100;
    }
    if !stored.name.is_empty() && stored.name == attrs.name {
        score += 40;
    } else if !stored.name.is_empty()
        && attrs
            .name
            .to_ascii_lowercase()
            .contains(&stored.name.to_ascii_lowercase())
    {
        score += 15;
    }
    if stored.role.is_some() && stored.role == role {
        score += 25;
    }
    if let (Some(a), Some(b)) = (stored.rect, attrs.rect) {
        score += rect_overlap_score(a, b);
    }
    score
}

fn ancestor_chain_bonus(stored: &StoredElement, element: &AXUIElement) -> i32 {
    let live_chain = collect_ancestor_labels(element, stored.ancestor_chain.len());
    let common = stored
        .ancestor_chain
        .iter()
        .rev()
        .zip(live_chain.iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    (common as i32) * 12
}

fn collect_ancestor_labels(element: &AXUIElement, max_len: usize) -> Vec<String> {
    let mut chain = Vec::new();
    let Some(mut current) = element_parent(element) else {
        return chain;
    };
    for _ in 0..max_len.saturating_add(2).min(24) {
        let (ax_role, name, parent) = element_ancestor_hop(&current);
        let (_, label) = map_ax_role(&ax_role);
        chain.push(format!("{label}:{name}"));
        match parent {
            Some(next) => current = next,
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

/// Resolve a stored reference and return visit stats (for a11y-bench).
#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn resolve_reference_with_stats(
    _session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    deadline: Instant,
) -> Result<ResolveStats, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    Ok(resolve_stored_element_with_stats(&stored, deadline)?.1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_rejected_when_it_would_pass_deadline() {
        let now = Instant::now();
        let deadline = now + Duration::from_millis(50);
        assert!(!backoff_fits_before_deadline(
            now,
            deadline,
            Duration::from_millis(120)
        ));
    }

    #[test]
    fn backoff_allowed_when_deadline_has_room() {
        let now = Instant::now();
        let deadline = now + Duration::from_secs(2);
        assert!(backoff_fits_before_deadline(
            now,
            deadline,
            Duration::from_millis(120)
        ));
    }

    #[test]
    fn fingerprint_prescreen_skips_role_mismatch_without_automation_id() {
        let stored = StoredElement {
            hwnd: WindowId(1),
            runtime_id: vec![],
            process_id: 1,
            name: "Save".to_string(),
            role: Some("Button".to_string()),
            automation_id: String::new(),
            rect: None,
            ancestor_chain: vec![],
        };
        let attrs = NodeAttrs {
            role: "AXStaticText".to_string(),
            name: "Save".to_string(),
            automation_id: String::new(),
            enabled: true,
            rect: None,
            value: None,
            children: vec![],
        };
        assert!(!fingerprint_prescreen(&stored, &attrs));
    }

    #[test]
    fn fingerprint_prescreen_keeps_automation_id_match_on_role_mismatch() {
        let stored = StoredElement {
            hwnd: WindowId(1),
            runtime_id: vec![],
            process_id: 1,
            name: "Save".to_string(),
            role: Some("Button".to_string()),
            automation_id: "save-btn".to_string(),
            rect: None,
            ancestor_chain: vec![],
        };
        let attrs = NodeAttrs {
            role: "AXGroup".to_string(),
            name: "Save".to_string(),
            automation_id: "save-btn".to_string(),
            enabled: true,
            rect: None,
            value: None,
            children: vec![],
        };
        assert!(fingerprint_prescreen(&stored, &attrs));
    }
}
