mod app_paths;
mod app_store;
mod capture_input;
mod command_output;
mod cursor_overlay;
mod display_metrics;
mod grid_overlay;
mod mouse_hook;
mod process_run;
mod ui_a11y;
mod workspace_fs;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, PhysicalPosition, Position, WebviewWindow};

pub use app_store::AppSettings;
pub use command_output::CommandOutput;

const WINDOW_EDGE_MARGIN: i32 = 16;

fn position_window_bottom_right(window: &WebviewWindow) {
    let monitor = match window.primary_monitor() {
        Ok(Some(monitor)) => monitor,
        _ => {
            let Ok(Some(monitor)) = window.current_monitor() else {
                return;
            };
            monitor
        }
    };
    let Ok(window_size) = window.outer_size() else {
        return;
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let x = monitor_position.x + monitor_size.width as i32
        - window_size.width as i32
        - WINDOW_EDGE_MARGIN;
    let y = monitor_position.y + monitor_size.height as i32
        - window_size.height as i32
        - WINDOW_EDGE_MARGIN;

    let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
}

fn show_window_bottom_right(window: WebviewWindow) {
    let _ = window.unminimize();
    position_window_bottom_right(&window);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.minimize();
            }
        })
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                position_window_bottom_right(&window);
            }

            let show_i = MenuItem::with_id(app, "show", "Show Actuate", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app
                .default_window_icon()
                .ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::NotFound, "missing default window icon")
                })?
                .clone();

            let _tray = TrayIconBuilder::with_id("actuate-tray")
                .icon(icon)
                .tooltip("Actuate — background agent")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            show_window_bottom_right(window);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let handle = tray.app_handle();
                        if let Some(window) = handle.get_webview_window("main") {
                            show_window_bottom_right(window);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_run::run_command,
            process_run::cancel_run_command,
            capture_input::capture_primary_display_png_base64,
            capture_input::pointer_move_to,
            capture_input::pointer_click,
            capture_input::type_text,
            capture_input::key_tap,
            capture_input::reset_pointer_automation_cancel,
            capture_input::cancel_pointer_automation,
            ui_a11y::ui_a11y_snapshot,
            ui_a11y::ui_a11y_interact,
            app_store::load_settings,
            app_store::save_settings,
            app_store::load_secret,
            app_store::store_secret,
            app_store::delete_secret,
            app_store::append_session_log,
            app_store::write_session_keyframe,
            app_store::clear_all_logs,
            app_store::open_logs_folder,
            workspace_fs::read_workspace_file,
            workspace_fs::write_workspace_file,
            workspace_fs::copy_workspace_file,
            workspace_fs::move_workspace_path,
            workspace_fs::list_workspace_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
