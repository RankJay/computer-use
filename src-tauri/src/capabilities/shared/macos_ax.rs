//! Shared macOS CGWindowList + AXUIElement plumbing.
//!
//! Used by the window manager (window/macos.rs) and the a11y provider
//! (accessibility/ax/). Exists because both resolve CGWindowIDs to
//! AXUIElements and speak the same AX attribute protocol.
//!
//! Does NOT handle: AX tree walking, snapshot arenas, input synthesis,
//! or any Windows/UIA concepts.

use std::ffi::c_void;
use std::ptr::NonNull;

#[cfg(feature = "a11y-bench")]
use std::cell::Cell;

use libc::pid_t;
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
use objc2_application_services::{
    AXCopyMultipleAttributeOptions, AXError, AXIsProcessTrusted, AXUIElement, AXValue, AXValueType,
};
use objc2_core_foundation::{
    CFArray, CFBoolean, CFDictionary, CFNull, CFNumber, CFRetained, CFString, CFType, CGPoint,
    CGSize,
};
use objc2_core_graphics::{
    kCGNullWindowID, kCGWindowLayer, kCGWindowName, kCGWindowNumber, kCGWindowOwnerName,
    kCGWindowOwnerPID, CGWindowListCopyWindowInfo, CGWindowListOption,
};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

pub(crate) const AX_WINDOWS: &str = "AXWindows";
pub(crate) const AX_TITLE: &str = "AXTitle";
pub(crate) const AX_ROLE: &str = "AXRole";
pub(crate) const AX_DESCRIPTION: &str = "AXDescription";
pub(crate) const AX_IDENTIFIER: &str = "AXIdentifier";
pub(crate) const AX_VALUE: &str = "AXValue";
pub(crate) const AX_ENABLED: &str = "AXEnabled";
pub(crate) const AX_FOCUSED: &str = "AXFocused";
pub(crate) const AX_POSITION: &str = "AXPosition";
pub(crate) const AX_SIZE: &str = "AXSize";
pub(crate) const AX_CHILDREN: &str = "AXChildren";
pub(crate) const AX_FOCUSED_UI_ELEMENT: &str = "AXFocusedUIElement";
pub(crate) const AX_FOCUSED_WINDOW: &str = "AXFocusedWindow";
pub(crate) const AX_MINIMIZED: &str = "AXMinimized";
pub(crate) const AX_CLOSE_BUTTON: &str = "AXCloseButton";
pub(crate) const AX_RAISE: &str = "AXRaise";
pub(crate) const AX_PRESS: &str = "AXPress";
pub(crate) const AX_SHOW_MENU: &str = "AXShowMenu";
pub(crate) const AX_SELECTED_TEXT: &str = "AXSelectedText";
pub(crate) const AX_SELECTED_CHILDREN: &str = "AXSelectedChildren";
pub(crate) const AX_PARENT: &str = "AXParent";

pub(crate) const ACCESSIBILITY_HINT: &str =
    "Grant Accessibility for Actuate in System Settings → Privacy & Security → Accessibility";

#[cfg(feature = "a11y-bench")]
thread_local! {
    static IPC_CALLS: Cell<u64> = const { Cell::new(0) };
}

#[inline]
fn record_ax_ipc() {
    #[cfg(feature = "a11y-bench")]
    IPC_CALLS.with(|c| c.set(c.get().saturating_add(1)));
}

/// Reset and return the thread-local AX IPC call counter (a11y-bench only).
#[cfg(feature = "a11y-bench")]
pub fn take_ax_ipc_calls() -> u64 {
    IPC_CALLS.with(|c| c.replace(0))
}

#[derive(Debug)]
pub(crate) struct CgWindowInfo {
    pub window_id: u32,
    pub pid: u32,
    pub title: String,
    pub process_name: String,
}

/// Visible-window filter (mirrors Win32 IsWindowVisible + non-empty title):
/// on-screen only, exclude desktop elements, layer 0, and a usable title
/// (window name, else owner name — titles need Screen Recording on recent macOS).
pub(crate) fn collect_cg_windows() -> Vec<CgWindowInfo> {
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
            owner.clone()
        } else {
            continue;
        };

        entries.push(CgWindowInfo {
            window_id: window_id as u32,
            pid: pid as u32,
            title,
            process_name: owner,
        });
    }
    entries
}

pub(crate) fn lookup_cg_window(id: WindowId) -> Result<CgWindowInfo, CommandError> {
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

pub(crate) fn dict_number(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<i64> {
    let value = dict.get(key)?;
    value.downcast::<CFNumber>().ok()?.as_i64()
}

pub(crate) fn dict_string(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<String> {
    let value = dict.get(key)?;
    Some(value.downcast::<CFString>().ok()?.to_string())
}

pub(crate) fn require_accessibility() -> Result<(), CommandError> {
    if unsafe { AXIsProcessTrusted() } {
        return Ok(());
    }
    Err(CommandError::new(
        ErrorCode::AccessibilityPermissionDenied,
        format!("Accessibility permission required. {ACCESSIBILITY_HINT}"),
    ))
}

pub(crate) fn activate_app(pid: u32) -> Result<(), CommandError> {
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

/// Strict CGWindowID → AX window. Sets a 1.5s per-app messaging timeout.
/// Does not fall back to the app root — callers that need that wrap this.
pub(crate) fn ax_window_for_cg(
    info: &CgWindowInfo,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    let app = unsafe { AXUIElement::new_application(info.pid as pid_t) };
    let _ = unsafe { app.set_messaging_timeout(1.5) };
    let windows = ax_copy_array(&app, AX_WINDOWS)?;
    let target = info.window_id;

    for window in windows.iter() {
        let mut cg_id = 0u32;
        // Undocumented but widely used; maps AX window → CGWindowID.
        let err = unsafe { ax_uielement_get_window(&window, &mut cg_id) };
        if err == 0 && cg_id == target {
            return Ok(window);
        }
    }

    // Fallback: match title when private helper is unavailable.
    for window in windows.iter() {
        if let Ok(title) = ax_copy_string(&window, AX_TITLE) {
            if title == info.title {
                return Ok(window);
            }
        }
    }

    Err(CommandError::new(
        ErrorCode::InvalidHwnd,
        "Could not resolve accessibility element for window",
    ))
}

pub(crate) fn map_ax_error(err: AXError, context: &str) -> Result<(), CommandError> {
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

pub(crate) fn ax_copy_attribute(
    element: &AXUIElement,
    attribute: &str,
) -> Result<CFRetained<CFType>, CommandError> {
    record_ax_ipc();
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

/// One IPC round trip for N attributes. Result is positional: `out[i]` matches
/// `attributes[i]`; `None` means missing/unsupported (CFNull or AXError sentinel).
pub(crate) fn ax_copy_attributes(
    element: &AXUIElement,
    attributes: &[&str],
) -> Result<Vec<Option<CFRetained<CFType>>>, CommandError> {
    if attributes.is_empty() {
        return Ok(Vec::new());
    }
    record_ax_ipc();
    let attr_objs: Vec<CFRetained<CFString>> = attributes
        .iter()
        .map(|name| CFString::from_str(name))
        .collect();
    let typed = CFArray::from_retained_objects(&attr_objs);
    // Binding takes untyped CFArray; strings are CFTypes so the cast is sound.
    let attrs: CFRetained<CFArray> = unsafe { CFRetained::cast_unchecked(typed) };
    let mut values: *const CFArray = std::ptr::null();
    let err = unsafe {
        element.copy_multiple_attribute_values(
            &attrs,
            AXCopyMultipleAttributeOptions::empty(),
            NonNull::from(&mut values),
        )
    };
    map_ax_error(err, "copy_multiple_attribute_values")?;
    let Some(ptr) = NonNull::new(values.cast_mut()) else {
        return Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            "Accessibility copy_multiple_attribute_values returned null",
        ));
    };
    // Create rule: take ownership of the returned array.
    let values: CFRetained<CFArray<CFType>> =
        unsafe { CFRetained::cast_unchecked(CFRetained::from_raw(ptr)) };
    if values.len() != attributes.len() {
        return Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            format!(
                "Accessibility batch returned {} values for {} attributes",
                values.len(),
                attributes.len()
            ),
        ));
    }
    Ok(values.iter().map(decode_slot).collect())
}

/// CFNull / kAXValueAXErrorType → None; otherwise retain the value.
fn decode_slot(value: CFRetained<CFType>) -> Option<CFRetained<CFType>> {
    if value.downcast_ref::<CFNull>().is_some() {
        return None;
    }
    if let Some(ax_value) = value.downcast_ref::<AXValue>() {
        if unsafe { ax_value.r#type() } == AXValueType::AXError {
            return None;
        }
    }
    Some(value)
}

pub(crate) fn ax_copy_string(
    element: &AXUIElement,
    attribute: &str,
) -> Result<String, CommandError> {
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

pub(crate) fn ax_copy_bool(element: &AXUIElement, attribute: &str) -> Option<bool> {
    let value = ax_copy_attribute(element, attribute).ok()?;
    value.downcast::<CFBoolean>().ok().map(|b| b.as_bool())
}

pub(crate) fn ax_copy_point(element: &AXUIElement, attribute: &str) -> Option<CGPoint> {
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

pub(crate) fn ax_copy_size(element: &AXUIElement, attribute: &str) -> Option<CGSize> {
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

pub(crate) fn ax_copy_array(
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

pub(crate) fn ax_copy_element(
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

pub(crate) fn ax_perform(element: &AXUIElement, action: &str) -> Result<(), CommandError> {
    let name = CFString::from_str(action);
    let err = unsafe { element.perform_action(&name) };
    map_ax_error(err, action)
}

pub(crate) fn set_ax_bool(
    element: &AXUIElement,
    attribute: &str,
    flag: bool,
) -> Result<(), CommandError> {
    set_ax_value(element, attribute, CFBoolean::new(flag))
}

pub(crate) fn set_ax_value(
    element: &AXUIElement,
    attribute: &str,
    value: &CFType,
) -> Result<(), CommandError> {
    let attr = CFString::from_str(attribute);
    let err = unsafe { element.set_attribute_value(&attr, value) };
    map_ax_error(err, attribute)
}

pub(crate) fn set_ax_point(
    element: &AXUIElement,
    attribute: &str,
    point: CGPoint,
) -> Result<(), CommandError> {
    let mut point = point;
    let value = unsafe {
        AXValue::new(
            AXValueType::CGPoint,
            NonNull::from(&mut point).cast::<c_void>(),
        )
    }
    .ok_or_else(|| {
        CommandError::new(ErrorCode::MoveFailed, "Failed to create AX position value")
    })?;
    set_ax_value(element, attribute, &value)
}

pub(crate) fn set_ax_size(
    element: &AXUIElement,
    attribute: &str,
    size: CGSize,
) -> Result<(), CommandError> {
    let mut size = size;
    let value = unsafe {
        AXValue::new(
            AXValueType::CGSize,
            NonNull::from(&mut size).cast::<c_void>(),
        )
    }
    .ok_or_else(|| CommandError::new(ErrorCode::ResizeFailed, "Failed to create AX size value"))?;
    set_ax_value(element, attribute, &value)
}

/// Slot helpers for batched attribute decode (a11y projection / resolve).
pub(crate) fn slot_string(slot: Option<CFRetained<CFType>>) -> Option<String> {
    slot?.downcast::<CFString>().ok().map(|s| s.to_string())
}

pub(crate) fn slot_bool(slot: Option<CFRetained<CFType>>) -> Option<bool> {
    slot?.downcast::<CFBoolean>().ok().map(|b| b.as_bool())
}

pub(crate) fn slot_point(slot: Option<CFRetained<CFType>>) -> Option<CGPoint> {
    let ax_value = slot?.downcast::<AXValue>().ok()?;
    let mut point = CGPoint::new(0.0, 0.0);
    let ok = unsafe {
        ax_value.value(
            AXValueType::CGPoint,
            NonNull::from(&mut point).cast::<c_void>(),
        )
    };
    ok.then_some(point)
}

pub(crate) fn slot_size(slot: Option<CFRetained<CFType>>) -> Option<CGSize> {
    let ax_value = slot?.downcast::<AXValue>().ok()?;
    let mut size = CGSize::new(0.0, 0.0);
    let ok = unsafe {
        ax_value.value(
            AXValueType::CGSize,
            NonNull::from(&mut size).cast::<c_void>(),
        )
    };
    ok.then_some(size)
}

pub(crate) fn slot_element(slot: Option<CFRetained<CFType>>) -> Option<CFRetained<AXUIElement>> {
    slot?.downcast::<AXUIElement>().ok()
}

pub(crate) fn slot_element_array(
    slot: Option<CFRetained<CFType>>,
) -> Option<Vec<CFRetained<AXUIElement>>> {
    let array = slot?.downcast::<CFArray>().ok()?;
    let typed: CFRetained<CFArray<AXUIElement>> = unsafe { CFRetained::cast_unchecked(array) };
    Some(typed.iter().collect())
}

/// Undocumented HIServices helper: AX window → CGWindowID.
/// Isolated here; prefer public AX attributes when a stable alternative exists.
pub(crate) unsafe fn ax_uielement_get_window(element: &AXUIElement, out: &mut u32) -> i32 {
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
    fn rejects_non_positive_id() {
        let error = lookup_cg_window(WindowId(0)).expect_err("zero id");
        assert_eq!(error.code, "invalid_hwnd");
    }

    #[test]
    fn decode_slot_treats_cfnull_as_absent() {
        let Some(null) = objc2_core_foundation::kCFNull else {
            return;
        };
        let retained: CFRetained<CFType> = CFRetained::from(null);
        assert!(decode_slot(retained).is_none());
    }

    #[test]
    fn decode_slot_treats_ax_error_sentinel_as_absent() {
        let mut err = AXError::NoValue;
        let Some(ax_value) = (unsafe {
            AXValue::new(
                AXValueType::AXError,
                NonNull::from(&mut err).cast::<c_void>(),
            )
        }) else {
            return;
        };
        let retained: CFRetained<CFType> = CFRetained::from(ax_value);
        assert!(decode_slot(retained).is_none());
    }

    #[test]
    fn decode_slot_keeps_real_values() {
        let s = CFString::from_str("hello");
        let retained: CFRetained<CFType> = CFRetained::from(s);
        let kept = decode_slot(retained).expect("string slot");
        let text = kept.downcast::<CFString>().expect("CFString").to_string();
        assert_eq!(text, "hello");
    }
}
