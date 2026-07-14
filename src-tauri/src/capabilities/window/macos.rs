//! macOS adapter for [`super::manager::WindowManager`].
//!
//! `WindowId` stores a `CGWindowID` as `i64` (wire key `windowId`).
//!
//! List uses `CGWindowListCopyWindowInfo` (on-screen, exclude desktop, layer 0).
//! Geometry / raise / state use Accessibility (`AXUIElement`). Matching a
//! `CGWindowID` to an AX window uses the undocumented `_AXUIElementGetWindow`
//! helper (in shared/macos_ax); title+bounds fallback if that fails.
//!
//! Maximize/restore return `action_unavailable` — macOS has no Win32 maximize twin;
//! do not map maximize to zoom.
//!
//! Known limits: Multi-Space / Stage Manager edge cases are best-effort.
//! Window titles may be blank without Screen Recording; we fall back to owner name.

use std::path::Path;
use std::time::Duration;

use libc::pid_t;
use objc2_app_kit::NSWorkspace;
use objc2_application_services::{AXIsProcessTrusted, AXUIElement};
use objc2_core_foundation::{CGPoint, CGSize};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::shared::macos_ax::{
    activate_app, ax_copy_element, ax_copy_string, ax_perform, ax_uielement_get_window,
    ax_window_for_cg, collect_cg_windows, lookup_cg_window, require_accessibility, set_ax_bool,
    set_ax_point, set_ax_size, ACCESSIBILITY_HINT, AX_CLOSE_BUTTON, AX_FOCUSED_WINDOW,
    AX_MINIMIZED, AX_POSITION, AX_PRESS, AX_RAISE, AX_SIZE, AX_TITLE,
};

use super::manager::WindowManager;
use super::types::{
    ActiveWindowResult, WindowActionResult, WindowId, WindowListResult, WindowMoveResult,
    WindowResizeResult, WindowStateOp, WindowStateResult, TIMEOUT_LIST_WINDOWS_MS,
};

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
            Err(error) if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() => {
                Err(error)
            }
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
            if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
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
            if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
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
                    if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
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

fn press_ax_button(window: &AXUIElement, button_attr: &str) -> Result<(), CommandError> {
    let button = ax_copy_element(window, button_attr)?;
    ax_perform(&button, AX_PRESS)
}

/// Run `work` on a helper thread; abandon it on timeout.
///
/// `CGWindowListCopyWindowInfo` is not cancellable. On timeout the receiver is
/// dropped and the worker is abandoned; the thread still exits once the call
/// returns because the buffered `sync_channel(1)` send never blocks.
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
