//! macOS adapter for [`super::manager::WindowManager`].
//!
//! `WindowId` stores a `CGWindowID` as `i64` (wire key `windowId`).
//!
//! List uses `CGWindowListCopyWindowInfo` (on-screen, exclude desktop, layer 0).
//! Geometry / raise / state use Accessibility (`AXUIElement`). Matching a
//! `CGWindowID` to an AX window uses the undocumented `_AXUIElementGetWindow`
//! helper (isolated below); title+bounds fallback if that fails.
//!
//! Maximize/restore return `action_unavailable` — macOS has no Win32 maximize twin;
//! do not map maximize to zoom.
//!
//! Known limits: Multi-Space / Stage Manager edge cases are best-effort.
//! Window titles may be blank without Screen Recording; we fall back to owner name.

use std::ffi::c_void;
use std::path::Path;
use std::ptr::NonNull;
use std::time::Duration;

use libc::pid_t;
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use objc2_application_services::{AXError, AXIsProcessTrusted, AXUIElement, AXValue, AXValueType};
use objc2_core_foundation::{
    CFArray, CFBoolean, CFDictionary, CFNumber, CFRetained, CFString, CFType, CGPoint, CGSize,
};
use objc2_core_graphics::{
    kCGNullWindowID, kCGWindowLayer, kCGWindowName, kCGWindowNumber, kCGWindowOwnerName,
    kCGWindowOwnerPID, CGWindowListCopyWindowInfo, CGWindowListOption,
};

use crate::capabilities::error::{CommandError, ErrorCode};

use super::manager::WindowManager;
use super::types::{
    ActiveWindowResult, WindowActionResult, WindowId, WindowListResult, WindowMoveResult,
    WindowResizeResult, WindowStateOp, WindowStateResult, TIMEOUT_LIST_WINDOWS_MS,
};

/// Accessibility attribute / action names (CFSTR macros; not exported by objc2 bindings).
const AX_WINDOWS: &str = "AXWindows";
const AX_TITLE: &str = "AXTitle";
const AX_POSITION: &str = "AXPosition";
const AX_SIZE: &str = "AXSize";
const AX_MINIMIZED: &str = "AXMinimized";
const AX_CLOSE_BUTTON: &str = "AXCloseButton";
const AX_FOCUSED_WINDOW: &str = "AXFocusedWindow";
const AX_RAISE: &str = "AXRaise";
const AX_PRESS: &str = "AXPress";

const ACCESSIBILITY_HINT: &str =
    "Grant Accessibility for Actuate in System Settings → Privacy & Security → Accessibility";

pub struct MacosWindowManager;

impl WindowManager for MacosWindowManager {
    fn list(&self) -> Result<WindowListResult, CommandError> {
        run_with_list_timeout(TIMEOUT_LIST_WINDOWS_MS, list_windows_impl)
    }

    fn focus(&self, id: WindowId) -> Result<WindowActionResult, CommandError> {
        // App activation does not require Accessibility. Specific-window AXRaise does.
        let info = lookup_cg_window(id)?;
        activate_app(info.pid)?;
        if !unsafe { AXIsProcessTrusted() } {
            return Ok(WindowActionResult { ok: true, id });
        }
        let window = ax_window_for_cg(&info)?;
        match ax_perform(&window, AX_RAISE) {
            Ok(()) => Ok(WindowActionResult { ok: true, id }),
            Err(error) if error.code == ErrorCode::ElevationRequired.as_str() => Err(error),
            Err(_) => Err(CommandError::new(
                ErrorCode::FocusFailed,
                format!("Could not bring window to foreground. {ACCESSIBILITY_HINT}"),
            )),
        }
    }

    fn move_window(&self, id: WindowId, x: i32, y: i32) -> Result<WindowMoveResult, CommandError> {
        require_accessibility()?;
        let info = lookup_cg_window(id)?;
        let window = ax_window_for_cg(&info)?;
        let point = CGPoint::new(x as f64, y as f64);
        set_ax_point(&window, AX_POSITION, point).map_err(|error| {
            if error.code == ErrorCode::ElevationRequired.as_str() {
                error
            } else {
                CommandError::new(ErrorCode::MoveFailed, error.message)
            }
        })?;
        Ok(WindowMoveResult { ok: true, id, x, y })
    }

    fn resize(
        &self,
        id: WindowId,
        width: i32,
        height: i32,
    ) -> Result<WindowResizeResult, CommandError> {
        if width <= 0 || height <= 0 {
            return Err(CommandError::new(
                ErrorCode::InvalidSize,
                "Width and height must be positive",
            ));
        }
        require_accessibility()?;
        let info = lookup_cg_window(id)?;
        let window = ax_window_for_cg(&info)?;
        let size = CGSize::new(width as f64, height as f64);
        set_ax_size(&window, AX_SIZE, size).map_err(|error| {
            if error.code == ErrorCode::ElevationRequired.as_str() {
                error
            } else {
                CommandError::new(ErrorCode::ResizeFailed, error.message)
            }
        })?;
        Ok(WindowResizeResult {
            ok: true,
            id,
            width,
            height,
        })
    }

    fn set_state(
        &self,
        id: WindowId,
        op: WindowStateOp,
    ) -> Result<WindowStateResult, CommandError> {
        if matches!(op, WindowStateOp::Maximize | WindowStateOp::Restore) {
            let op_name = match op {
                WindowStateOp::Maximize => "maximize",
                WindowStateOp::Restore => "restore",
                WindowStateOp::Minimize | WindowStateOp::Close => unreachable!(),
            };
            return Err(CommandError::new(
                ErrorCode::ActionUnavailable,
                format!(
                    "{op_name} is not available on macOS (no Win32 {op_name} equivalent). Use minimize/close or resize instead."
                ),
            ));
        }

        require_accessibility()?;
        let info = lookup_cg_window(id)?;
        let window = ax_window_for_cg(&info)?;

        let op_name = match op {
            WindowStateOp::Minimize => {
                set_ax_bool(&window, AX_MINIMIZED, true)?;
                "minimize"
            }
            WindowStateOp::Maximize | WindowStateOp::Restore => unreachable!(),
            WindowStateOp::Close => {
                press_ax_button(&window, AX_CLOSE_BUTTON).map_err(|error| {
                    if error.code == ErrorCode::ElevationRequired.as_str() {
                        error
                    } else {
                        CommandError::new(ErrorCode::CloseFailed, error.message)
                    }
                })?;
                "close"
            }
        };

        Ok(WindowStateResult {
            ok: true,
            id,
            op: op_name.to_string(),
        })
    }

    fn active(&self) -> Result<ActiveWindowResult, CommandError> {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(front) = workspace.frontmostApplication() else {
            return Err(CommandError::new(
                ErrorCode::NoActiveWindow,
                "No frontmost application is available",
            ));
        };
        let pid = front.processIdentifier();
        let process_name = front
            .localizedName()
            .map(|name| name.to_string())
            .or_else(|| process_name_from_pid(pid as u32));

        // Prefer AX focused window when trusted; else first on-screen CG window for the PID.
        if unsafe { AXIsProcessTrusted() } {
            if let Ok(Some(result)) = active_via_ax(pid, process_name.clone()) {
                return Ok(result);
            }
        }

        let entries = collect_cg_windows();
        let Some(entry) = entries.into_iter().find(|e| e.pid == pid as u32) else {
            return Err(CommandError::new(
                ErrorCode::NoActiveWindow,
                "No on-screen window found for the frontmost application",
            ));
        };

        Ok(ActiveWindowResult {
            id: WindowId(entry.window_id as i64),
            title: Some(entry.title),
            process_name,
        })
    }
}

#[derive(Debug)]
struct CgWindowInfo {
    window_id: u32,
    pid: u32,
    title: String,
    process_name: String,
}

fn list_windows_impl() -> Result<WindowListResult, CommandError> {
    let entries = collect_cg_windows();
    let name_deadline = std::time::Instant::now()
        + Duration::from_millis(TIMEOUT_LIST_WINDOWS_MS.saturating_sub(500));

    let mut lines = Vec::with_capacity(entries.len());
    for entry in entries {
        let process_name = if std::time::Instant::now() < name_deadline {
            if !entry.process_name.is_empty() {
                entry.process_name
            } else {
                process_name_from_pid(entry.pid).unwrap_or_else(|| format!("pid:{}", entry.pid))
            }
        } else {
            format!("pid:{}", entry.pid)
        };
        lines.push(format!(
            "{}  {}  \"{}\"",
            entry.window_id, process_name, entry.title
        ));
    }

    Ok(WindowListResult {
        text: lines.join("\n"),
    })
}

/// Visible-window filter (mirrors Win32 IsWindowVisible + non-empty title):
/// on-screen only, exclude desktop elements, layer 0, and a usable title
/// (window name, else owner name — titles need Screen Recording on recent macOS).
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

fn lookup_cg_window(id: WindowId) -> Result<CgWindowInfo, CommandError> {
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

fn dict_number(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<i64> {
    let value = dict.get(key)?;
    value.downcast::<CFNumber>().ok()?.as_i64()
}

fn dict_string(dict: &CFDictionary<CFString, CFType>, key: &CFString) -> Option<String> {
    let value = dict.get(key)?;
    Some(value.downcast::<CFString>().ok()?.to_string())
}

fn process_name_from_pid(pid: u32) -> Option<String> {
    let mut buf = [0i8; 4096];
    let len =
        unsafe { libc::proc_pidpath(pid as pid_t, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        return None;
    }
    let path = unsafe { std::ffi::CStr::from_ptr(buf.as_ptr()) }
        .to_string_lossy()
        .into_owned();
    Path::new(&path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

fn require_accessibility() -> Result<(), CommandError> {
    if unsafe { AXIsProcessTrusted() } {
        return Ok(());
    }
    Err(CommandError::new(
        ErrorCode::ElevationRequired,
        format!("Accessibility permission required. {ACCESSIBILITY_HINT}"),
    ))
}

fn activate_app(pid: u32) -> Result<(), CommandError> {
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

fn ax_window_for_cg(info: &CgWindowInfo) -> Result<CFRetained<AXUIElement>, CommandError> {
    let app = unsafe { AXUIElement::new_application(info.pid as pid_t) };
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

fn active_via_ax(
    pid: pid_t,
    process_name: Option<String>,
) -> Result<Option<ActiveWindowResult>, CommandError> {
    let app = unsafe { AXUIElement::new_application(pid) };
    let Ok(focused) = ax_copy_element(&app, AX_FOCUSED_WINDOW) else {
        return Ok(None);
    };
    let title = ax_copy_string(&focused, AX_TITLE).ok();
    let mut cg_id = 0u32;
    let err = unsafe { ax_uielement_get_window(&focused, &mut cg_id) };
    if err != 0 || cg_id == 0 {
        return Ok(None);
    }
    Ok(Some(ActiveWindowResult {
        id: WindowId(cg_id as i64),
        title,
        process_name,
    }))
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

fn ax_perform(element: &AXUIElement, action: &str) -> Result<(), CommandError> {
    let name = CFString::from_str(action);
    let err = unsafe { element.perform_action(&name) };
    map_ax_error(err, action)
}

fn set_ax_point(
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

fn set_ax_size(element: &AXUIElement, attribute: &str, size: CGSize) -> Result<(), CommandError> {
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

fn press_ax_button(window: &AXUIElement, button_attr: &str) -> Result<(), CommandError> {
    let button = ax_copy_element(window, button_attr)?;
    ax_perform(&button, AX_PRESS)
}

fn map_ax_error(err: AXError, context: &str) -> Result<(), CommandError> {
    if err == AXError::Success {
        return Ok(());
    }
    if err == AXError::APIDisabled {
        return Err(CommandError::new(
            ErrorCode::ElevationRequired,
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
        format!("Accessibility error {0} for {context}", err.0),
    ))
}

/// Undocumented HIServices helper: AX window → CGWindowID.
/// Isolated here; prefer public AX attributes when a stable alternative exists.
unsafe fn ax_uielement_get_window(element: &AXUIElement, out: &mut u32) -> i32 {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn _AXUIElementGetWindow(element: *const c_void, window_id: *mut u32) -> i32;
    }
    unsafe { _AXUIElementGetWindow(std::ptr::from_ref(element).cast(), out) }
}

fn run_with_list_timeout<F, T>(timeout_ms: u64, work: F) -> Result<T, CommandError>
where
    F: FnOnce() -> Result<T, CommandError> + Send + 'static,
    T: Send + 'static,
{
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let _ = sender.send(work());
    });

    match receiver.recv_timeout(Duration::from_millis(timeout_ms)) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(CommandError::new(
            ErrorCode::ListWindowsTimeout,
            "Listing windows timed out",
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(CommandError::new(
            ErrorCode::WorkerFailed,
            "Window worker task failed",
        )),
    }
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
    fn rejects_non_positive_resize() {
        let error = MacosWindowManager
            .resize(WindowId(1), 0, 100)
            .expect_err("invalid width");
        assert_eq!(error.code, "invalid_size");
    }

    #[test]
    fn list_line_format_helper() {
        let line = format!("{}  {}  \"{}\"", 42u32, "TextEdit", "Untitled");
        let mut parts = line.splitn(3, "  ");
        assert_eq!(parts.next(), Some("42"));
        assert_eq!(parts.next(), Some("TextEdit"));
        assert_eq!(parts.next(), Some("\"Untitled\""));
    }
}
