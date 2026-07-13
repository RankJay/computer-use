//! AX actions: click, focus, set_value, send_keys, scroll, invoke.

use std::time::Instant;

use objc2_application_services::AXUIElement;
use objc2_core_foundation::CFRetained;
use objc2_core_graphics::{
    CGEvent, CGEventSource, CGEventSourceStateID, CGEventTapLocation, CGPreflightPostEventAccess,
    CGRequestPostEventAccess,
};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::input::{mouse_click, mouse_scroll, synthesizer};
use crate::capabilities::window::WindowId;

use super::super::outline::{
    CT_BUTTON, CT_EDIT, CT_HYPERLINK, CT_LIST_ITEM, CT_MENU_ITEM, CT_TAB_ITEM,
};
use super::super::send_keys_syntax::{parse_send_keys, Segment};
use super::super::state::SnapshotStore;
use super::super::types::{ActionResult, GetValueResult};
use super::resolve::resolve_stored_element;
use super::roles::map_ax_role;
use super::session::{
    ax_press, ax_show_menu, element_parent, element_rect, element_role, element_value_text,
    foreground_window, is_useful_value, lookup_cg_window, set_focused, set_value_string, AxSession,
};

pub(super) fn click_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;
    let target = resolve_click_target(&element);
    let _ = set_focused(&target);

    let ax_role = element_role(&target);
    let (control_type, _) = map_ax_role(&ax_role);

    if control_type != CT_EDIT {
        if ax_press(&target).is_ok() {
            return Ok(ActionResult {
                ok: true,
                method: "ax_press".to_string(),
                foregrounded,
            });
        }
    }

    synthetic_click(&target, "left").map(|_| ActionResult {
        ok: true,
        method: "synthetic_click".to_string(),
        foregrounded,
    })
}

fn resolve_click_target(element: &AXUIElement) -> CFRetained<AXUIElement> {
    let mut chain = vec![CFRetained::from(element)];
    let mut current = CFRetained::from(element);
    for _ in 0..8 {
        match element_parent(&current) {
            Some(parent) => {
                chain.push(parent.clone());
                current = parent;
            }
            None => break,
        }
    }

    for node in &chain {
        let (ct, _) = map_ax_role(&element_role(node));
        if ct == CT_HYPERLINK {
            return node.clone();
        }
    }
    for node in &chain {
        let (ct, _) = map_ax_role(&element_role(node));
        if matches!(
            ct,
            CT_BUTTON | CT_MENU_ITEM | CT_LIST_ITEM | CT_TAB_ITEM | CT_HYPERLINK
        ) {
            return node.clone();
        }
    }
    CFRetained::from(element)
}

fn synthetic_click(element: &AXUIElement, button: &str) -> Result<(), CommandError> {
    let (l, t, r, b) = element_rect(element).ok_or_else(|| {
        CommandError::new(
            ErrorCode::ClickFailed,
            "Element has no screen position for synthetic click",
        )
    })?;
    let x = (l + r) / 2;
    let y = (t + b) / 2;
    mouse_click(button.to_string(), Some(1), Some(x), Some(y)).map(|_| ())
}

pub(super) fn set_value_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    text: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;

    if set_value_string(&element, text).is_ok() {
        return Ok(ActionResult {
            ok: true,
            method: "ax_value".to_string(),
            foregrounded,
        });
    }

    let _ = set_focused(&element);
    type_unicode(text)?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

pub(super) fn send_keys_impl(
    session: &AxSession,
    store: &SnapshotStore,
    hwnd: WindowId,
    text: &str,
    reference: Option<&str>,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    if text.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "text must not be empty",
        ));
    }

    let info = lookup_cg_window(hwnd)?;
    let foregrounded = foreground_window(&info)?;
    if let Some(ref_str) = reference {
        let stored = store.resolve_ref_or_stale(ref_str)?;
        if stored.hwnd != hwnd {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "reference does not belong to the provided hwnd",
            ));
        }
        let element = resolve_stored_element(session, &stored, &info, deadline)?;
        let _ = set_focused(&element);
    }

    play_send_keys(text)?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

/// Play the agent SendKeys dialect (`^v`, `{ENTER}`, plain text, …).
fn play_send_keys(text: &str) -> Result<(), CommandError> {
    let segments = parse_send_keys(text)?;
    let synth = synthesizer();
    for segment in segments {
        match segment {
            Segment::Text(run) => type_unicode(&run)?,
            Segment::Press { key, count } => {
                synth
                    .key_press(key, count)
                    .map_err(|error| CommandError::new(ErrorCode::SendKeysFailed, error.message))?;
            }
            Segment::Chord { modifiers, keys } => {
                for modifier in &modifiers {
                    synth.key_down(*modifier).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
                for key in &keys {
                    synth.key_press(*key, 1).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
                for modifier in modifiers.iter().rev() {
                    synth.key_up(*modifier).map_err(|error| {
                        CommandError::new(ErrorCode::SendKeysFailed, error.message)
                    })?;
                }
            }
        }
    }
    Ok(())
}

pub(super) fn focus_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;
    set_focused(&element).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
            error
        } else {
            CommandError::new(ErrorCode::FocusFailed, error.message)
        }
    })?;
    Ok(ActionResult {
        ok: true,
        method: "focus".to_string(),
        foregrounded,
    })
}

pub(super) fn get_value_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    deadline: Instant,
) -> Result<GetValueResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;

    if let Some(value) = element_value_text(&element) {
        if is_useful_value(&value) {
            return Ok(GetValueResult {
                value,
                kind: "text".to_string(),
                min: None,
                max: None,
                method: "ax_value".to_string(),
            });
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

pub(super) fn scroll_element_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    direction: &str,
    amount: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;

    let (dx, dy) = scroll_deltas(direction, amount)?;
    let action = match direction {
        "up" => "AXScrollUpByPage",
        "down" => "AXScrollDownByPage",
        "left" => "AXScrollLeftByPage",
        "right" => "AXScrollRightByPage",
        _ => "",
    };
    if amount == "large" && !action.is_empty() {
        if super::session::ax_perform(&element, action).is_ok() {
            return Ok(ActionResult {
                ok: true,
                method: "ax_scroll".to_string(),
                foregrounded,
            });
        }
    }

    let (l, t, r, b) = element_rect(&element).ok_or_else(|| {
        CommandError::new(
            ErrorCode::ScrollFailed,
            "Element has no screen position for scroll",
        )
    })?;
    let x = (l + r) / 2;
    let y = (t + b) / 2;
    mouse_scroll(dx, dy, Some(x), Some(y))
        .map_err(|error| CommandError::new(ErrorCode::ScrollFailed, error.message))?;
    Ok(ActionResult {
        ok: true,
        method: "synthetic_scroll".to_string(),
        foregrounded,
    })
}

fn scroll_deltas(direction: &str, amount: &str) -> Result<(i32, i32), CommandError> {
    let step = match amount {
        "large" => 5,
        "small" | "" => 1,
        other => {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("amount must be small or large; got {other}"),
            ));
        }
    };
    match direction {
        "up" => Ok((0, step)),
        "down" => Ok((0, -step)),
        "left" => Ok((step, 0)),
        "right" => Ok((-step, 0)),
        other => Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("direction must be up, down, left, or right; got {other}"),
        )),
    }
}

pub(super) fn right_click_element_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;
    let _ = set_focused(&element);

    if ax_show_menu(&element).is_ok() {
        return Ok(ActionResult {
            ok: true,
            method: "ax_show_menu".to_string(),
            foregrounded,
        });
    }

    synthetic_click(&element, "right").map(|_| ActionResult {
        ok: true,
        method: "right_click".to_string(),
        foregrounded,
    })
}

pub(super) fn invoke_action_impl(
    session: &AxSession,
    store: &SnapshotStore,
    reference: &str,
    action: &str,
    deadline: Instant,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let info = lookup_cg_window(stored.hwnd)?;
    let element = resolve_stored_element(session, &stored, &info, deadline)?;
    let foregrounded = foreground_window(&info)?;
    let method = parse_invoke_action(action)?;

    let ax_action = match method {
        "press" => "AXPress",
        "toggle" => "AXPress",
        "expand" => "AXExpand",
        "collapse" => "AXCollapse",
        "select" => "AXPress",
        _ => {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                format!("Unknown action: {action}"),
            ));
        }
    };

    super::session::ax_perform(&element, ax_action).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
            error
        } else {
            CommandError::new(
                ErrorCode::ActionUnavailable,
                format!("AX action {ax_action} unavailable: {}", error.message),
            )
        }
    })?;

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

fn type_unicode(text: &str) -> Result<(), CommandError> {
    if !CGPreflightPostEventAccess() {
        let _ = CGRequestPostEventAccess();
        return Err(CommandError::new(
            ErrorCode::AccessibilityPermissionDenied,
            "Posting input events was denied. Grant Accessibility for Actuate in System Settings → Privacy & Security → Accessibility",
        ));
    }
    let source =
        CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok_or_else(|| {
            CommandError::new(ErrorCode::SendKeysFailed, "CGEventSourceCreate failed")
        })?;

    // Chunk into small Unicode runs (CGEvent limit is typically 20 UniChars).
    let utf16: Vec<u16> = text.encode_utf16().collect();
    for chunk in utf16.chunks(20) {
        let event = CGEvent::new_keyboard_event(Some(&source), 0, true).ok_or_else(|| {
            CommandError::new(
                ErrorCode::SendKeysFailed,
                "CGEventCreateKeyboardEvent failed",
            )
        })?;
        unsafe {
            CGEvent::keyboard_set_unicode_string(Some(&event), chunk.len() as u64, chunk.as_ptr());
        }
        CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&event));

        let up = CGEvent::new_keyboard_event(Some(&source), 0, false).ok_or_else(|| {
            CommandError::new(
                ErrorCode::SendKeysFailed,
                "CGEventCreateKeyboardEvent failed",
            )
        })?;
        unsafe {
            CGEvent::keyboard_set_unicode_string(Some(&up), chunk.len() as u64, chunk.as_ptr());
        }
        CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&up));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::send_keys_syntax::{parse_send_keys, Segment};
    use super::*;
    use crate::capabilities::input::keys::Key;

    #[test]
    fn parses_invoke_actions() {
        assert_eq!(parse_invoke_action("press").unwrap(), "press");
        assert_eq!(parse_invoke_action("toggle").unwrap(), "toggle");
        assert!(parse_invoke_action("click").is_err());
    }

    #[test]
    fn maps_scroll_deltas() {
        assert_eq!(scroll_deltas("down", "small").unwrap(), (0, -1));
        assert_eq!(scroll_deltas("up", "large").unwrap(), (0, 5));
        assert!(scroll_deltas("diagonal", "small").is_err());
    }

    #[test]
    fn send_keys_caret_v_is_command_chord_on_macos() {
        let segments = parse_send_keys("^v").expect("parse");
        assert_eq!(
            segments,
            vec![Segment::Chord {
                modifiers: vec![Key::Win],
                keys: vec![Key::V],
            }]
        );
    }
}
