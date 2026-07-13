mod error;
mod path_utils;

mod accessibility;
mod clipboard;
mod file_system;
mod input;
mod shared;
mod shell;
#[cfg(any(windows, target_os = "macos"))]
pub mod smoke_support;
mod window;

pub use accessibility::{
    accessibility_click, accessibility_element_at_point, accessibility_find_element,
    accessibility_focus, accessibility_get_focused, accessibility_get_selection,
    accessibility_get_text, accessibility_get_value, accessibility_inspect,
    accessibility_invoke_action, accessibility_query, accessibility_right_click_element,
    accessibility_scroll_element, accessibility_send_keys, accessibility_set_value,
    accessibility_snapshot, accessibility_wait, SnapshotStore,
};

#[cfg(any(windows, target_os = "macos"))]
pub use accessibility::a11y_live_smoke;
#[cfg(all(windows, feature = "a11y-bench"))]
pub use accessibility::bench;
pub use clipboard::{
    read_clipboard, read_clipboard_html, read_clipboard_image, write_clipboard,
    write_clipboard_html, write_clipboard_image,
};
pub use file_system::{
    create_directory, delete_path, duplicate_path, move_path, patch_file, read_directory,
    read_file, search_files, stat_path, write_file,
};
pub use input::{
    hotkey, key_down, key_press, key_up, mouse_click, mouse_down, mouse_drag, mouse_hover,
    mouse_move, mouse_scroll, mouse_up,
};
pub use shared::wait;
pub use shell::{
    get_env, get_system_info, launch, process_info, process_kill, process_list, run_shell, set_env,
};
pub use window::WindowId;
pub use window::{
    get_active_window, window_focus, window_list, window_move, window_resize, window_state,
};
