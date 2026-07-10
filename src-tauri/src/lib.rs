use tauri::Manager;

mod capabilities;
mod commands;

use capabilities::{
    accessibility_click, accessibility_expand_node, accessibility_find_element, accessibility_focus,
    accessibility_get_value, accessibility_invoke_action, accessibility_right_click_element,
    accessibility_scroll_element, accessibility_send_keys, accessibility_set_value,
    accessibility_snapshot, create_directory, delete_path, duplicate_path, get_active_window,
    get_env, get_system_info, hotkey, key_down, key_press, key_up, launch, mouse_click, mouse_down,
    mouse_drag, mouse_hover, mouse_move, mouse_scroll, mouse_up, move_path, patch_file, process_info,
    process_kill, process_list, read_clipboard, read_clipboard_html, read_clipboard_image,
    read_directory, read_file, run_shell, search_files, set_env, stat_path, wait, window_focus,
    window_list, window_move, window_resize, window_state, write_clipboard, write_clipboard_html,
    write_clipboard_image, write_file, SnapshotStore,
};

#[cfg(desktop)]
fn apply_frameless_window(window: &tauri::WebviewWindow) {
    let _ = window.set_decorations(false);
}

#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> tauri::Result<()> {
    let _ = app.remove_menu();

    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    use commands::window::{reveal_main_window_once, set_taskbar_visible};

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

    // Safety net: if the frontend never signals ready, still reveal the window.
    let app_handle = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        reveal_main_window_once(&app_handle);
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::maintenance::open_logs_folder,
            commands::maintenance::clear_logs,
            commands::maintenance::reset_session,
            commands::window::app_ready,
            read_file,
            read_directory,
            search_files,
            write_file,
            create_directory,
            patch_file,
            delete_path,
            move_path,
            duplicate_path,
            stat_path,
            run_shell,
            read_clipboard,
            write_clipboard,
            read_clipboard_html,
            write_clipboard_html,
            read_clipboard_image,
            write_clipboard_image,
            get_system_info,
            wait,
            window_list,
            window_focus,
            window_state,
            window_move,
            window_resize,
            get_active_window,
            process_list,
            process_info,
            process_kill,
            launch,
            get_env,
            set_env,
            accessibility_snapshot,
            accessibility_find_element,
            accessibility_expand_node,
            accessibility_click,
            accessibility_set_value,
            accessibility_send_keys,
            accessibility_focus,
            accessibility_get_value,
            accessibility_scroll_element,
            accessibility_right_click_element,
            accessibility_invoke_action,
            mouse_move,
            mouse_click,
            mouse_scroll,
            mouse_drag,
            mouse_hover,
            mouse_down,
            mouse_up,
            hotkey,
            key_down,
            key_up,
            key_press,
        ]);

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    commands::window::set_taskbar_visible(&window, true);
                    let _ = window.set_focus();
                }
            }))
            .plugin(
                tauri_plugin_window_state::Builder::new()
                    .skip_initial_state("main")
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::all()
                            .difference(tauri_plugin_window_state::StateFlags::DECORATIONS),
                    )
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

            app.manage(SnapshotStore::default());

            #[cfg(desktop)]
            setup_desktop(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // Window reveal is driven by frontend `app_ready` (or the setup timeout).
        .run(|_app_handle, _event| {});
}
