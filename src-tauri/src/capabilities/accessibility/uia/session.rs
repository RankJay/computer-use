use uiautomation::core::{UIAutomation, UIElement, UITreeWalker};
use uiautomation::patterns::UIPatternType;
use uiautomation::types::{ControlType, ElementMode, Handle, TreeScope, UIProperty};
use uiautomation::variants::{Value, Variant};
use windows::core::Interface;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::IUIAutomation2;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::state::SnapshotStore;
use super::super::types;

pub use super::super::outline::SnapshotStats;

pub(super) const RESOLVE_RETRY_ATTEMPTS: u32 = 3;
pub(super) const TRANSIENT_UIA_RETRY_MS: u64 = 120;

const CONNECTION_TIMEOUT_MS: u32 = 500;
const TRANSACTION_TIMEOUT_MS: u32 = 1_500;

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

pub(super) fn process_id_for_hwnd(hwnd: WindowId) -> Option<u32> {
    let handle = hwnd_from_id(hwnd).ok()?;
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

pub fn snapshot_timeout_ms(store: &SnapshotStore, hwnd: WindowId) -> u64 {
    if let Some(process_id) = process_id_for_hwnd(hwnd) {
        if !store.was_process_touched(process_id) {
            return types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS;
        }
    }
    types::TIMEOUT_SNAPSHOT_MS
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
    if let Ok(automation2) = automation.as_ref().cast::<IUIAutomation2>() {
        unsafe {
            let _ = automation2.SetConnectionTimeout(CONNECTION_TIMEOUT_MS);
            let _ = automation2.SetTransactionTimeout(TRANSACTION_TIMEOUT_MS);
        }
    }
}

pub(super) fn element_name(element: &UIElement) -> String {
    element
        .get_cached_name()
        .or_else(|_| element.get_name())
        .unwrap_or_default()
}

pub(super) fn element_automation_id(element: &UIElement) -> String {
    element
        .get_cached_automation_id()
        .or_else(|_| element.get_automation_id())
        .unwrap_or_default()
}

pub(super) fn element_control_type(
    element: &UIElement,
) -> Result<ControlType, uiautomation::Error> {
    element
        .get_cached_control_type()
        .or_else(|_| element.get_control_type())
}

pub(super) fn element_is_enabled(element: &UIElement) -> Option<bool> {
    element
        .is_cached_enabled()
        .or_else(|_| element.is_enabled())
        .ok()
}

pub(super) fn element_is_offscreen(element: &UIElement) -> Option<bool> {
    element
        .is_cached_offscreen()
        .or_else(|_| element.is_offscreen())
        .ok()
}

pub(super) fn element_value_text(element: &UIElement) -> Option<String> {
    element
        .get_cached_property_value(UIProperty::ValueValue)
        .or_else(|_| element.get_property_value(UIProperty::ValueValue))
        .ok()
        .map(|value| value.to_string())
}

pub(super) fn element_rect(element: &UIElement) -> Option<(i32, i32, i32, i32)> {
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

pub(super) fn element_runtime_id(element: &UIElement) -> Result<Vec<i32>, uiautomation::Error> {
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

pub(super) fn hwnd_from_id(id: WindowId) -> Result<Handle, CommandError> {
    if id.0 == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle must not be zero",
        ));
    }
    Ok(Handle::from(HWND(id.0 as isize as *mut _)))
}

pub(super) fn map_uia_error(error: uiautomation::Error, code: ErrorCode) -> CommandError {
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

pub(super) fn is_transaction_timeout(error: &uiautomation::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    message.contains("timeout") || message.contains("timed out")
}

pub(super) fn is_transient_subscriber_error(error: &uiautomation::Error) -> bool {
    const EVENT_E_ALL_SUBSCRIBERS_FAILED: i32 = -2147220991;
    error.code() == EVENT_E_ALL_SUBSCRIBERS_FAILED
        || error
            .message()
            .to_ascii_lowercase()
            .contains("unable to invoke any of the subscribers")
}

/// Pattern advertised but unusable (common on Chromium Edit/omnibox) — fall through to next click strategy.
pub(super) fn is_recoverable_click_pattern_error(error: &uiautomation::Error) -> bool {
    if is_transient_subscriber_error(error) {
        return true;
    }
    let message = error.message().to_ascii_lowercase();
    message.contains("pattern not found")
        || message.contains("pattern is not supported")
        || message.contains("does not support the")
}

pub(super) fn is_transient_command_error(error: &CommandError) -> bool {
    error
        .message
        .to_ascii_lowercase()
        .contains("unable to invoke any of the subscribers")
}

pub(super) fn is_useful_value(value_text: &str) -> bool {
    if value_text.is_empty() || value_text == "EMPTY" {
        return false;
    }
    !(value_text.starts_with("STRING(")
        || value_text.starts_with("INT(")
        || value_text.starts_with("BOOL("))
}

pub(super) fn should_skip_control(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Text | ControlType::Image | ControlType::Separator | ControlType::ToolTip
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::error::{CommandError, ErrorCode};

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
}
