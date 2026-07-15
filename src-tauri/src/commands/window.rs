use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::capabilities::error::{CommandError, ErrorCode};

#[cfg(desktop)]
use std::sync::Once;

#[cfg(desktop)]
static SHOW_WINDOW: Once = Once::new();

#[cfg(desktop)]
fn window_state_flags() -> tauri_plugin_window_state::StateFlags {
    use tauri_plugin_window_state::StateFlags;
    StateFlags::all().difference(StateFlags::DECORATIONS)
}

/// Frameless + no OS shadow so CSS can own the 24px chrome radius.
/// Win11 `shadow: true` forces system corner radius and fights custom rounding.
#[cfg(desktop)]
fn apply_frameless_window(window: &tauri::WebviewWindow) {
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(false);
}

#[cfg(desktop)]
pub fn set_taskbar_visible(window: &tauri::WebviewWindow, visible: bool) {
    #[cfg(target_os = "windows")]
    let _ = window.set_skip_taskbar(!visible);
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, visible);
    }
}

/// Cocoa top-left for bottom-right docking inside `visibleFrame` (points, bottom-left origin).
#[cfg(desktop)]
fn cocoa_bottom_right_top_left(
    visible_x: f64,
    visible_y: f64,
    visible_w: f64,
    frame_w: f64,
    frame_h: f64,
    margin: f64,
) -> (f64, f64) {
    let x = visible_x + visible_w - frame_w - margin;
    let top_left_y = visible_y + margin + frame_h;
    (x, top_left_y)
}

/// Tao/wry `set_position` on macOS mixes logical points with `CGDisplayPixelsHigh`, so
/// Retina placement from `work_area()` lands off-screen and AppKit leaves the window
/// at Tao's create-time `center()`. Drive `NSWindow` directly instead.
#[cfg(all(desktop, target_os = "macos"))]
fn position_bottom_right(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSScreen, NSWindow};
    use objc2_foundation::NSPoint;

    let mtm = MainThreadMarker::new().ok_or(tauri::Error::WindowNotFound)?;
    let ns_window: &NSWindow = unsafe { &*window.ns_window()?.cast() };
    let screen = ns_window
        .screen()
        .or_else(|| NSScreen::mainScreen(mtm))
        .ok_or(tauri::Error::WindowNotFound)?;

    let visible = screen.visibleFrame();
    let frame = ns_window.frame();
    let (x, top_left_y) = cocoa_bottom_right_top_left(
        visible.origin.x,
        visible.origin.y,
        visible.size.width,
        frame.size.width,
        frame.size.height,
        16.0,
    );
    ns_window.setFrameTopLeftPoint(NSPoint::new(x, top_left_y));
    Ok(())
}

#[cfg(all(desktop, not(target_os = "macos")))]
fn position_bottom_right(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use tauri::PhysicalPosition;

    let monitor = match window.primary_monitor()? {
        Some(monitor) => monitor,
        None => window
            .current_monitor()?
            .ok_or(tauri::Error::WindowNotFound)?,
    };

    let work_area = monitor.work_area();
    let outer_size = window.outer_size()?;
    let margin = (16.0 * monitor.scale_factor()).round() as i32;

    let x = work_area.position.x + work_area.size.width as i32 - outer_size.width as i32 - margin;
    let y = work_area.position.y + work_area.size.height as i32 - outer_size.height as i32 - margin;

    window.set_position(PhysicalPosition::new(x, y))
}

/// True when the frame mid-point is near the work-area center (Tao macOS default).
#[cfg(all(desktop, target_os = "macos"))]
fn is_approximately_centered(window: &tauri::WebviewWindow) -> bool {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSScreen, NSWindow};

    let Some(mtm) = MainThreadMarker::new() else {
        return false;
    };
    let Ok(ptr) = window.ns_window() else {
        return false;
    };
    let ns_window: &NSWindow = unsafe { &*ptr.cast() };
    let Some(screen) = ns_window.screen().or_else(|| NSScreen::mainScreen(mtm)) else {
        return false;
    };

    let visible = screen.visibleFrame();
    let frame = ns_window.frame();
    let mid_x = frame.origin.x + frame.size.width / 2.0;
    let mid_y = frame.origin.y + frame.size.height / 2.0;
    let target_x = visible.origin.x + visible.size.width / 2.0;
    let target_y = visible.origin.y + visible.size.height / 2.0;
    (mid_x - target_x).abs() < 120.0 && (mid_y - target_y).abs() < 120.0
}

#[cfg(desktop)]
fn show_main_window(app: &AppHandle) {
    use tauri_plugin_window_state::{WindowExt, DEFAULT_FILENAME};

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let has_state = app
        .path()
        .app_config_dir()
        .is_ok_and(|dir| dir.join(DEFAULT_FILENAME).exists());

    let place_bottom_right = if has_state {
        let _ = window.restore_state(window_state_flags());
        // Prior Retina runs often persisted Tao's centered default; re-dock those.
        #[cfg(target_os = "macos")]
        {
            is_approximately_centered(&window)
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    } else {
        true
    };

    if place_bottom_right {
        let _ = position_bottom_right(&window);
    }

    apply_frameless_window(&window);

    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }

    // Re-apply after show in case orderFront left a centered frame.
    if place_bottom_right {
        let _ = position_bottom_right(&window);
    }

    set_taskbar_visible(&window, true);
    let _ = window.set_focus();
}

/// Show, focus, or hide the main window.
/// Hidden → show+focus. Visible but unfocused → focus. Focused → hide.
#[cfg(desktop)]
pub fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
        set_taskbar_visible(&window, true);
        let _ = window.set_focus();
        return;
    }
    if window.is_focused().unwrap_or(false) {
        let _ = window.hide();
        set_taskbar_visible(&window, false);
        return;
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Show the main window once the frontend has painted its first ready frame.
pub fn reveal_main_window_once(app: &AppHandle) {
    #[cfg(desktop)]
    SHOW_WINDOW.call_once(|| show_main_window(app));
    #[cfg(not(desktop))]
    let _ = app;
}

/// Frontend signals that the initial route is loaded and painted.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    reveal_main_window_once(&app);
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyResult {
    pub notified: bool,
}

/// Send an OS notification via the notification plugin.
/// When `only_if_unfocused` is true, skips if the main window currently has focus.
#[tauri::command]
pub fn notify(
    app: AppHandle,
    title: String,
    body: String,
    only_if_unfocused: bool,
) -> Result<NotifyResult, CommandError> {
    if only_if_unfocused {
        let Some(window) = app.get_webview_window("main") else {
            return Ok(NotifyResult { notified: false });
        };
        if window.is_focused().unwrap_or(false) {
            return Ok(NotifyResult { notified: false });
        }
    }

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| {
            CommandError::new(ErrorCode::NotifyFailed, "Failed to show notification")
                .with_details(e.to_string())
        })?;

    Ok(NotifyResult { notified: true })
}

#[cfg(all(test, desktop))]
mod tests {
    use super::cocoa_bottom_right_top_left;

    #[test]
    fn cocoa_bottom_right_accounts_for_dock_margin() {
        // visibleFrame: dock occupies y=0..70, usable is y=70 height 900, width 1440
        let (x, top_left_y) = cocoa_bottom_right_top_left(0.0, 70.0, 1440.0, 410.0, 720.0, 16.0);
        assert_eq!(x, 1440.0 - 410.0 - 16.0);
        // bottom of window at 70+16; top-left y = bottom + height
        assert_eq!(top_left_y, 70.0 + 16.0 + 720.0);
    }
}
