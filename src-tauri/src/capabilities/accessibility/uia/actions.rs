use uiautomation::core::UIElement;
use uiautomation::patterns::{
    UIExpandCollapsePattern, UIInvokePattern, UILegacyIAccessiblePattern, UIRangeValuePattern,
    UIScrollItemPattern, UIScrollPattern, UISelectionItemPattern, UITogglePattern, UIValuePattern,
};
use uiautomation::types::{ControlType, ScrollAmount};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::state::SnapshotStore;
use super::super::types::{ActionResult, GetValueResult};
use super::resolve::{foreground_window, resolve_stored_element};
use super::session::{
    hwnd_from_id, is_recoverable_click_pattern_error, is_useful_value, map_uia_error, UiaSession,
};

pub(super) fn click_impl(
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

pub(super) fn set_value_impl(
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

pub(super) fn send_keys_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    hwnd: WindowId,
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
            .element_from_handle(hwnd_from_id(hwnd)?)
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

pub(super) fn focus_impl(
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

pub(super) fn get_value_impl(
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

pub(super) fn scroll_element_impl(
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

pub(super) fn right_click_element_impl(
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

pub(super) fn invoke_action_impl(
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

#[cfg(test)]
mod tests {
    use super::*;
    use uiautomation::types::ScrollAmount;

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
}
