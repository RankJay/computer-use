use tauri::Manager;

mod capabilities;
mod commands;
mod db;

pub use capabilities::{
    accessibility_click, accessibility_element_at_point, accessibility_find_element,
    accessibility_focus, accessibility_get_focused, accessibility_get_selection,
    accessibility_get_text, accessibility_get_value, accessibility_inspect,
    accessibility_invoke_action, accessibility_query, accessibility_right_click_element,
    accessibility_scroll_element, accessibility_send_keys, accessibility_set_value,
    accessibility_snapshot, accessibility_wait, create_directory, delete_path, duplicate_path,
    ensure_dpi_awareness, get_active_window, get_env, get_system_info, hotkey, key_down, key_press,
    key_up, launch, mouse_click, mouse_down, mouse_drag, mouse_hover, mouse_move, mouse_scroll,
    mouse_up, move_path, patch_file, process_info, process_kill, process_list, read_clipboard,
    read_clipboard_html, read_clipboard_image, read_directory, read_file, run_shell, screenshot,
    screenshot_region, search_files, set_env, stat_path, wait, window_focus, window_list,
    window_move, window_resize, window_state, write_clipboard, write_clipboard_html,
    write_clipboard_image, write_file, SnapshotStore, WindowId, WindowStateOp,
};

#[cfg(any(windows, target_os = "macos"))]
pub use capabilities::a11y_live_smoke;
#[cfg(any(windows, target_os = "macos"))]
pub use capabilities::smoke_support;

#[cfg(all(any(windows, target_os = "macos"), feature = "a11y-bench"))]
pub use capabilities::bench as a11y_bench;

/// Frameless + no OS shadow so CSS can own the 24px chrome radius.
/// Win11 `shadow: true` forces system corner radius and fights custom rounding.
#[cfg(desktop)]
fn apply_frameless_window(window: &tauri::WebviewWindow) {
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(false);
}

/// Ask the frontend to quit so an armed update can install first.
#[cfg(desktop)]
fn request_app_quit(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let _ = app.emit("quit-requested", ());
}

/// macOS menu bar: App menu (About/Hide/Quit) + Edit (clipboard shortcuts for WKWebView).
#[cfg(all(desktop, target_os = "macos"))]
fn install_macos_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};

    let quit = MenuItem::with_id(app, "quit", "Quit Actuate", true, Some("cmd+q"))?;
    let app_menu = SubmenuBuilder::new(app, "Actuate")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let menu = MenuBuilder::new(app).item(&app_menu).item(&edit).build()?;
    let _ = app.set_menu(menu);

    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "quit" {
            request_app_quit(app);
        }
    });
    Ok(())
}

/// Dock-visible regular app (not LSUIElement accessory). Close still hides to tray.
#[cfg(all(desktop, target_os = "macos"))]
fn configure_macos_dock_app(app: &tauri::App, window: &tauri::WebviewWindow) {
    let _ = app
        .handle()
        .set_activation_policy(tauri::ActivationPolicy::Regular);
    let _ = window.set_skip_taskbar(false);
}

#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    install_macos_menu(app)?;
    #[cfg(not(target_os = "macos"))]
    let _ = app.remove_menu();

    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    use commands::window::{reveal_main_window_once, set_taskbar_visible, toggle_main_window};
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
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
                "quit" => request_app_quit(app),
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
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    #[cfg(target_os = "macos")]
    let toggle_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyA);
    #[cfg(not(target_os = "macos"))]
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyA);
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            })
            .build(),
    )?;
    app.global_shortcut()
        .register(toggle_shortcut)
        .map_err(|e| tauri::Error::Io(std::io::Error::other(e.to_string())))?;

    let window = app
        .get_webview_window("main")
        .expect("main window not found");

    apply_frameless_window(&window);
    #[cfg(target_os = "macos")]
    configure_macos_dock_app(app, &window);

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
    // Before any user32 metrics / capture / cursor work (agent tools share this process).
    capabilities::ensure_dpi_awareness();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    // Single-instance must register first so deep-link argv is forwarded to the running app.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                // With the `deep-link` feature, the deep-link plugin already emits onOpenUrl.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    commands::window::set_taskbar_visible(&window, true);
                    let _ = window.set_focus();
                }
            }));
    }

    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:chats.db", db::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::maintenance::open_logs_folder,
            commands::maintenance::clear_logs,
            commands::maintenance::reset_session,
            commands::macos_permissions::get_macos_permission_status,
            commands::macos_permissions::request_macos_permission,
            commands::macos_permissions::open_macos_privacy_settings,
            commands::platform::get_platform_capabilities,
            commands::window::app_ready,
            commands::window::notify,
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
            screenshot,
            screenshot_region,
            process_list,
            process_info,
            process_kill,
            launch,
            get_env,
            set_env,
            accessibility_snapshot,
            accessibility_find_element,
            accessibility_query,
            accessibility_wait,
            accessibility_get_text,
            accessibility_get_focused,
            accessibility_element_at_point,
            accessibility_inspect,
            accessibility_get_selection,
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
        builder = builder.plugin(
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
            // Stronghold writes salt.txt without creating the parent dir.
            if let Some(parent) = salt_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            // Vault lives under app data dir (`appDataDir()` on the frontend).
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data path");
            std::fs::create_dir_all(&app_data_dir)?;
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            app.manage(SnapshotStore::default());

            // Dev / unpackaged: associate schemes with this executable on Linux/Windows.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            #[cfg(desktop)]
            setup_desktop(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        // Window reveal is driven by frontend `app_ready` (or the setup timeout).
        .run(|_app_handle, _event| {});
}
