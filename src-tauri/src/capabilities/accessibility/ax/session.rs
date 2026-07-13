//! AX session helpers: window scoping, attribute reads, permission checks.

use std::ffi::c_void;
use std::ptr::NonNull;

use libc::pid_t;
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
use objc2_application_services::{AXError, AXIsProcessTrusted, AXUIElement, AXValue, AXValueType};
use objc2_core_foundation::{
    CFArray, CFBoolean, CFDictionary, CFNumber, CFRetained, CFString, CFType, CGPoint, CGSize,
};
use objc2_core_graphics::{
    kCGNullWindowID, kCGWindowLayer, kCGWindowName, kCGWindowNumber, kCGWindowOwnerName,
    kCGWindowOwnerPID, CGWindowListCopyWindowInfo, CGWindowListOption,
};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::state::SnapshotStore;
use super::super::types;

pub use super::super::outline::SnapshotStats;

pub(super) const RESOLVE_RETRY_ATTEMPTS: u32 = 3;
pub(super) const TRANSIENT_AX_RETRY_MS: u64 = 120;

const AX_WINDOWS: &str = "AXWindows";
const AX_TITLE: &str = "AXTitle";
const AX_ROLE: &str = "AXRole";
const AX_DESCRIPTION: &str = "AXDescription";
const AX_IDENTIFIER: &str = "AXIdentifier";
const AX_VALUE: &str = "AXValue";
const AX_ENABLED: &str = "AXEnabled";
const AX_FOCUSED: &str = "AXFocused";
const AX_POSITION: &str = "AXPosition";
const AX_SIZE: &str = "AXSize";
const AX_CHILDREN: &str = "AXChildren";
const AX_FOCUSED_UI_ELEMENT: &str = "AXFocusedUIElement";
const AX_RAISE: &str = "AXRaise";
const AX_PRESS: &str = "AXPress";
const AX_SHOW_MENU: &str = "AXShowMenu";
const AX_SELECTED_TEXT: &str = "AXSelectedText";
const AX_SELECTED_CHILDREN: &str = "AXSelectedChildren";
const AX_PARENT: &str = "AXParent";

const ACCESSIBILITY_HINT: &str =
    "Grant Accessibility for Actuate in System Settings → Privacy & Security → Accessibility";

pub struct AxSession {
    pub system_wide: CFRetained<AXUIElement>,
}

impl AxSession {
    /// Build the long-lived session on the a11y worker thread (AX affinity).
    pub fn init_on_worker_thread() -> Result<Self, CommandError> {
        require_accessibility()?;
        let system_wide = unsafe { AXUIElement::new_system_wide() };
        // Soft timeout so hung apps don't stall the worker indefinitely.
        let _ = unsafe { system_wide.set_messaging_timeout(1.5) };
        Ok(Self { system_wide })
    }
}

#[derive(Debug)]
pub(super) struct CgWindowInfo {
    pub window_id: u32,
    pub pid: u32,
    pub title: String,
}

pub(super) fn process_id_for_hwnd(hwnd: WindowId) -> Option<u32> {
    lookup_cg_window(hwnd).ok().map(|info| info.pid)
}

pub fn snapshot_timeout_ms(store: &SnapshotStore, hwnd: WindowId) -> u64 {
    if let Some(process_id) = process_id_for_hwnd(hwnd) {
        if !store.was_process_touched(process_id) {
            return types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS;
        }
    }
    types::TIMEOUT_SNAPSHOT_MS
}

pub(super) fn require_accessibility() -> Result<(), CommandError> {
    if unsafe { AXIsProcessTrusted() } {
        return Ok(());
    }
    Err(CommandError::new(
        ErrorCode::AccessibilityPermissionDenied,
        format!("Accessibility permission required. {ACCESSIBILITY_HINT}"),
    ))
}

pub(super) fn lookup_cg_window(id: WindowId) -> Result<CgWindowInfo, CommandError> {
    if id.0 <= 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle must be positive",
        ));
    }
    let target = id.0 as u32;
    collect_cg_windows()
        .into_iter()
        .find(|entry| entry.window_id == target)
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidHwnd, "Window handle is not valid"))
}

pub(super) fn ax_window_for_hwnd(hwnd: WindowId) -> Result<CFRetained<AXUIElement>, CommandError> {
    require_accessibility()?;
    let info = lookup_cg_window(hwnd)?;
    ax_window_for_cg(&info)
}

fn ax_window_for_cg(info: &CgWindowInfo) -> Result<CFRetained<AXUIElement>, CommandError> {
    let app = unsafe { AXUIElement::new_application(info.pid as pid_t) };
    let _ = unsafe { app.set_messaging_timeout(1.5) };
    let windows = ax_copy_array(&app, AX_WINDOWS)?;
    let target = info.window_id;

    for window in windows.iter() {
        let mut cg_id = 0u32;
        let err = unsafe { ax_uielement_get_window(&window, &mut cg_id) };
        if err == 0 && cg_id == target {
            return Ok(window);
        }
    }

    for window in windows.iter() {
        if let Ok(title) = ax_copy_string(&window, AX_TITLE) {
            if title == info.title {
                return Ok(window);
            }
        }
    }

    // Last resort: app root when window AX is unavailable.
    Ok(app)
}

fn collect_cg_windows() -> Vec<CgWindowInfo> {
    let options =
        CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;
    let Some(raw_list) = CGWindowListCopyWindowInfo(options, kCGNullWindowID) else {
        return Vec::new();
    };

    let list: CFRetained<CFArray<CFDictionary<CFString, CFType>>> =
        unsafe { CFRetained::cast_unchecked(raw_list) };

    let mut entries = Vec::new();
    for dict in list.iter() {
        let Some(window_id) = dict_number(&dict, unsafe { kCGWindowNumber }) else {
            continue;
        };
        if window_id == 0 {
            continue;
        }
        let layer = dict_number(&dict, unsafe { kCGWindowLayer }).unwrap_or(0);
        if layer != 0 {
            continue;
        }
        let Some(pid) = dict_number(&dict, unsafe { kCGWindowOwnerPID }) else {
            continue;
        };
        let owner = dict_string(&dict, unsafe { kCGWindowOwnerName }).unwrap_or_default();
        let name = dict_string(&dict, unsafe { kCGWindowName }).unwrap_or_default();
        let title = if !name.is_empty() {
            name
        } else if !owner.is_empty() {
            owner
        } else {
            continue;
        };

        entries.push(CgWindowInfo {
            window_id: window_id as u32,
            pid: pid as u32,
            title,
        });
    }
    entries
}

fn dict_number(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<i64> {
    let value = dict.get(key)?;
    value.downcast::<CFNumber>().ok()?.as_i64()
}

fn dict_string(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<String> {
    let value = dict.get(key)?;
    Some(value.downcast::<CFString>().ok()?.to_string())
}

pub(super) fn activate_app(pid: u32) -> Result<(), CommandError> {
    let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as pid_t)
    else {
        return Err(CommandError::new(
            ErrorCode::FocusFailed,
            "Could not find running application for window",
        ));
    };
    let options = NSApplicationActivationOptions::ActivateAllWindows;
    if !app.activateWithOptions(options) {
        return Err(CommandError::new(
            ErrorCode::FocusDenied,
            format!("Could not activate application. {ACCESSIBILITY_HINT}"),
        ));
    }
    Ok(())
}

pub(super) fn foreground_window(hwnd: WindowId) -> Result<bool, CommandError> {
    let info = lookup_cg_window(hwnd)?;
    activate_app(info.pid)?;
    if let Ok(window) = ax_window_for_cg(&info) {
        let _ = ax_perform(&window, AX_RAISE);
    }
    Ok(true)
}

pub(super) fn element_role(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_ROLE).unwrap_or_default()
}

pub(super) fn element_name(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_TITLE)
        .or_else(|_| ax_copy_string(element, AX_DESCRIPTION))
        .unwrap_or_default()
}

pub(super) fn element_automation_id(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_IDENTIFIER).unwrap_or_default()
}

pub(super) fn element_value_text(element: &AXUIElement) -> Option<String> {
    ax_copy_string(element, AX_VALUE)
        .ok()
        .filter(|v| is_useful_value(v))
}

pub(super) fn element_is_enabled(element: &AXUIElement) -> bool {
    ax_copy_bool(element, AX_ENABLED).unwrap_or(true)
}

pub(super) fn element_rect(element: &AXUIElement) -> Option<(i32, i32, i32, i32)> {
    let pos = ax_copy_point(element, AX_POSITION)?;
    let size = ax_copy_size(element, AX_SIZE)?;
    let left = pos.x.round() as i32;
    let top = pos.y.round() as i32;
    let right = left + size.width.round() as i32;
    let bottom = top + size.height.round() as i32;
    Some((left, top, right, bottom))
}

pub(super) fn element_children(element: &AXUIElement) -> Vec<CFRetained<AXUIElement>> {
    ax_copy_array(element, AX_CHILDREN)
        .map(|arr| arr.iter().collect())
        .unwrap_or_default()
}

pub(super) fn element_parent(element: &AXUIElement) -> Option<CFRetained<AXUIElement>> {
    ax_copy_element(element, AX_PARENT).ok()
}

pub(super) fn set_focused(element: &AXUIElement) -> Result<(), CommandError> {
    set_ax_bool(element, AX_FOCUSED, true)
}

pub(super) fn set_value_string(element: &AXUIElement, text: &str) -> Result<(), CommandError> {
    let value = CFString::from_str(text);
    set_ax_value(element, AX_VALUE, &value)
}

pub(super) fn ax_perform(element: &AXUIElement, action: &str) -> Result<(), CommandError> {
    let name = CFString::from_str(action);
    let err = unsafe { element.perform_action(&name) };
    map_ax_error(err, action)
}

pub(super) fn ax_press(element: &AXUIElement) -> Result<(), CommandError> {
    ax_perform(element, AX_PRESS)
}

pub(super) fn ax_show_menu(element: &AXUIElement) -> Result<(), CommandError> {
    ax_perform(element, AX_SHOW_MENU)
}

pub(super) fn ax_selected_text(element: &AXUIElement) -> Option<String> {
    ax_copy_string(element, AX_SELECTED_TEXT).ok()
}

pub(super) fn ax_selected_children(element: &AXUIElement) -> Vec<CFRetained<AXUIElement>> {
    ax_copy_array(element, AX_SELECTED_CHILDREN)
        .map(|arr| arr.iter().collect())
        .unwrap_or_default()
}

pub(super) fn focused_element(
    session: &AxSession,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    ax_copy_element(&session.system_wide, AX_FOCUSED_UI_ELEMENT).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
            error
        } else {
            CommandError::new(ErrorCode::GetFocusedFailed, error.message)
        }
    })
}

pub(super) fn element_at_point(
    session: &AxSession,
    x: i32,
    y: i32,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    let mut value: *const AXUIElement = std::ptr::null();
    let err = unsafe {
        session
            .system_wide
            .copy_element_at_position(x as f32, y as f32, NonNull::from(&mut value))
    };
    map_ax_error(err, "element_at_point")?;
    let Some(ptr) = NonNull::new(value.cast_mut()) else {
        return Err(CommandError::new(
            ErrorCode::ElementAtPointFailed,
            "No accessibility element at point",
        ));
    };
    Ok(unsafe { CFRetained::from_raw(ptr) })
}

pub(super) fn element_pid(element: &AXUIElement) -> Option<u32> {
    let mut pid: pid_t = 0;
    let err = unsafe { element.pid(NonNull::from(&mut pid)) };
    if err == AXError::Success && pid > 0 {
        Some(pid as u32)
    } else {
        None
    }
}

pub(super) fn element_cg_window_id(element: &AXUIElement) -> Option<u32> {
    let mut current: CFRetained<AXUIElement> = CFRetained::from(element);
    for _ in 0..24 {
        let mut cg_id = 0u32;
        let err = unsafe { ax_uielement_get_window(&current, &mut cg_id) };
        if err == 0 && cg_id != 0 {
            return Some(cg_id);
        }
        match element_parent(&current) {
            Some(parent) => current = parent,
            None => break,
        }
    }
    None
}

pub(super) fn is_useful_value(value_text: &str) -> bool {
    !value_text.is_empty()
}

pub(super) fn is_transient_command_error(error: &CommandError) -> bool {
    let message = error.message.to_ascii_lowercase();
    message.contains("cannot complete") || message.contains("invalid ui element")
}

pub(super) fn map_ax_error(err: AXError, context: &str) -> Result<(), CommandError> {
    if err == AXError::Success {
        return Ok(());
    }
    if err == AXError::APIDisabled {
        return Err(CommandError::new(
            ErrorCode::AccessibilityPermissionDenied,
            format!("Accessibility API disabled while handling {context}. {ACCESSIBILITY_HINT}"),
        ));
    }
    if err == AXError::CannotComplete || err == AXError::NotImplemented {
        return Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            format!(
                "Accessibility could not complete {context} (error {}). {ACCESSIBILITY_HINT}",
                err.0
            ),
        ));
    }
    Err(CommandError::new(
        ErrorCode::ActionUnavailable,
        format!("Accessibility error {} for {context}", err.0),
    ))
}

fn ax_copy_attribute(
    element: &AXUIElement,
    attribute: &str,
) -> Result<CFRetained<CFType>, CommandError> {
    let attr = CFString::from_str(attribute);
    let mut value: *const CFType = std::ptr::null();
    let err = unsafe { element.copy_attribute_value(&attr, NonNull::from(&mut value)) };
    map_ax_error(err, attribute)?;
    let Some(ptr) = NonNull::new(value.cast_mut()) else {
        return Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            format!("Accessibility attribute {attribute} returned null"),
        ));
    };
    Ok(unsafe { CFRetained::from_raw(ptr) })
}

fn ax_copy_string(element: &AXUIElement, attribute: &str) -> Result<String, CommandError> {
    let value = ax_copy_attribute(element, attribute)?;
    value
        .downcast::<CFString>()
        .map(|s| s.to_string())
        .map_err(|_| {
            CommandError::new(
                ErrorCode::ActionUnavailable,
                format!("Accessibility attribute {attribute} was not a string"),
            )
        })
}

fn ax_copy_bool(element: &AXUIElement, attribute: &str) -> Option<bool> {
    let value = ax_copy_attribute(element, attribute).ok()?;
    value.downcast::<CFBoolean>().ok().map(|b| b.as_bool())
}

fn ax_copy_point(element: &AXUIElement, attribute: &str) -> Option<CGPoint> {
    let value = ax_copy_attribute(element, attribute).ok()?;
    let ax_value = value.downcast::<AXValue>().ok()?;
    let mut point = CGPoint::new(0.0, 0.0);
    let ok = unsafe {
        ax_value.value(
            AXValueType::CGPoint,
            NonNull::from(&mut point).cast::<c_void>(),
        )
    };
    ok.then_some(point)
}

fn ax_copy_size(element: &AXUIElement, attribute: &str) -> Option<CGSize> {
    let value = ax_copy_attribute(element, attribute).ok()?;
    let ax_value = value.downcast::<AXValue>().ok()?;
    let mut size = CGSize::new(0.0, 0.0);
    let ok = unsafe {
        ax_value.value(
            AXValueType::CGSize,
            NonNull::from(&mut size).cast::<c_void>(),
        )
    };
    ok.then_some(size)
}

fn ax_copy_array(
    element: &AXUIElement,
    attribute: &str,
) -> Result<CFRetained<CFArray<AXUIElement>>, CommandError> {
    let value = ax_copy_attribute(element, attribute)?;
    value
        .downcast::<CFArray>()
        .map_err(|_| {
            CommandError::new(
                ErrorCode::ActionUnavailable,
                format!("Accessibility attribute {attribute} was not an array"),
            )
        })
        .map(|array| unsafe { CFRetained::cast_unchecked(array) })
}

fn ax_copy_element(
    element: &AXUIElement,
    attribute: &str,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    let value = ax_copy_attribute(element, attribute)?;
    value.downcast::<AXUIElement>().map_err(|_| {
        CommandError::new(
            ErrorCode::ActionUnavailable,
            format!("Accessibility attribute {attribute} was not an element"),
        )
    })
}

fn set_ax_bool(element: &AXUIElement, attribute: &str, flag: bool) -> Result<(), CommandError> {
    set_ax_value(element, attribute, CFBoolean::new(flag))
}

fn set_ax_value(
    element: &AXUIElement,
    attribute: &str,
    value: &CFType,
) -> Result<(), CommandError> {
    let attr = CFString::from_str(attribute);
    let err = unsafe { element.set_attribute_value(&attr, value) };
    map_ax_error(err, attribute)
}

unsafe fn ax_uielement_get_window(element: &AXUIElement, out: &mut u32) -> i32 {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn _AXUIElementGetWindow(element: *const c_void, window_id: *mut u32) -> i32;
    }
    unsafe { _AXUIElementGetWindow(std::ptr::from_ref(element).cast(), out) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_positive_hwnd() {
        let error = lookup_cg_window(WindowId(0)).expect_err("zero id");
        assert_eq!(error.code, "invalid_hwnd");
    }
}
