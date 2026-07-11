use std::thread;
use std::time::Duration;

use uiautomation::controls::WindowControl;
use uiautomation::core::UIElement;
use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::types::{ControlType, TreeScope, UIProperty};
use uiautomation::variants::{Value, Variant};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::outline::{format_record_line, stored_from_record};
use super::super::state::{make_reference, SnapshotStore, StoredElement};
use super::super::types::TextResult;
use super::session::{
    element_automation_id, element_control_type, element_name, element_rect, hwnd_from_id,
    is_transient_command_error, map_uia_error, process_id_for_hwnd, UiaSession,
    RESOLVE_RETRY_ATTEMPTS, TRANSIENT_UIA_RETRY_MS,
};
use super::tree_extract::project_element_allow_text;

pub(super) fn resolve_stored_element(
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
    let handle = hwnd_from_id(stored.hwnd)?;
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
    scored.sort_by_key(|b| std::cmp::Reverse(b.0));

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

pub(super) fn foreground_window(
    session: &UiaSession,
    hwnd: WindowId,
) -> Result<bool, CommandError> {
    let handle = hwnd_from_id(hwnd)?;
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

pub(super) fn parse_role(role: &str) -> Result<ControlType, CommandError> {
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

pub(super) fn resolve_element_hwnd(
    session: &UiaSession,
    element: &UIElement,
    preferred: Option<WindowId>,
) -> Result<WindowId, CommandError> {
    if let Some(hwnd) = preferred {
        hwnd_from_id(hwnd)?;
        return Ok(hwnd);
    }

    if let Ok(handle) = element.get_native_window_handle() {
        let raw: isize = handle.into();
        if raw != 0 {
            return Ok(WindowId(raw as i64));
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
                        return Ok(WindowId(raw as i64));
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

pub(super) fn mint_projected_element(
    store: &SnapshotStore,
    hwnd: WindowId,
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

#[cfg(test)]
mod tests {
    use super::*;
    use uiautomation::types::ControlType;

    #[test]
    fn parse_role_accepts_common_aliases() {
        assert_eq!(parse_role("link").unwrap(), ControlType::Hyperlink);
        assert_eq!(parse_role("Hyperlink").unwrap(), ControlType::Hyperlink);
        assert_eq!(parse_role("textbox").unwrap(), ControlType::Edit);
        assert_eq!(parse_role("tab").unwrap(), ControlType::TabItem);
        assert!(parse_role("banana").is_err());
    }
}
