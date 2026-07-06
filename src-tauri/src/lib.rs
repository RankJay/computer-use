mod capabilities;

use std::sync::Once;

use capabilities::{delete_file, read_file, run_tests, search_files, write_file};
use tauri::{AppHandle, Manager, PhysicalPosition, RunEvent};
use tauri_plugin_window_state::{StateFlags, WindowExt, DEFAULT_FILENAME};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(desktop)]
fn window_state_flags() -> StateFlags {
    StateFlags::all().difference(StateFlags::DECORATIONS)
}

#[cfg(desktop)]
fn apply_frameless_window(window: &tauri::WebviewWindow) {
    let _ = window.set_decorations(false);
}

#[cfg(desktop)]
fn set_taskbar_visible(window: &tauri::WebviewWindow, visible: bool) {
    #[cfg(target_os = "windows")]
    let _ = window.set_skip_taskbar(!visible);
    #[cfg(not(target_os = "windows"))]
    let _ = visible;
}

#[cfg(desktop)]
fn position_bottom_right(window: &tauri::WebviewWindow) -> tauri::Result<()> {
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

#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> tauri::Result<()> {
    let _ = app.remove_menu();

    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    let tray_icon = app.default_window_icon().expect("missing app icon").clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .menu(&menu)
        .on_menu_event(|app, event| {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            match event.id().as_ref() {
                "show" => {
                    let _ = window.show();
                    set_taskbar_visible(&window, true);
                    let _ = window.set_focus();
                }
                "hide" => {
                    let _ = window.hide();
                    set_taskbar_visible(&window, false);
                }
                "quit" => app.exit(0),
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
                let app = tray.app_handle();
                let Some(window) = app.get_webview_window("main") else {
                    return;
                };
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                    set_taskbar_visible(&window, false);
                } else {
                    let _ = window.show();
                    set_taskbar_visible(&window, true);
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    let window = app
        .get_webview_window("main")
        .expect("main window not found");

    apply_frameless_window(&window);

    let window_for_close = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_for_close.hide();
            set_taskbar_visible(&window_for_close, false);
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    static SHOW_WINDOW: Once = Once::new();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    set_taskbar_visible(&window, true);
                    let _ = window.set_focus();
                }
            }))
            .plugin(
                tauri_plugin_window_state::Builder::new()
                    .skip_initial_state("main")
                    .with_state_flags(window_state_flags())
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path")
                .join("salt.txt");
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            #[cfg(desktop)]
            setup_desktop(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file,
            search_files,
            write_file,
            delete_file,
            run_tests,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(desktop)]
            if matches!(event, RunEvent::Ready) {
                SHOW_WINDOW.call_once(|| show_main_window(app_handle));
            }
        });
}
