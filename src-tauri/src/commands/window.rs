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

#[cfg(desktop)]
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

    if has_state {
        let _ = window.restore_state(window_state_flags());
    } else {
        let _ = position_bottom_right(&window);
    }

    apply_frameless_window(&window);

    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
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
