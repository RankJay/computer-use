mod app_paths;
mod app_store;
mod capture_input;
mod command_output;
mod process_run;
mod workspace_fs;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

pub use app_store::AppSettings;
pub use command_output::CommandOutput;

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
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
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
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_run::run_command,
            capture_input::capture_primary_display_png_base64,
            capture_input::pointer_move_to,
            capture_input::pointer_click,
            capture_input::type_text,
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
            workspace_fs::list_workspace_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
