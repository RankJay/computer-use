mod path_utils;

mod accessibility;
mod clipboard;
mod file_system;
mod shared;
mod shell;
mod window;

pub use accessibility::{
    accessibility_click, accessibility_expand_node, accessibility_find_element, accessibility_focus,
    accessibility_get_value, accessibility_invoke_action, accessibility_right_click_element,
    accessibility_scroll_element, accessibility_send_keys, accessibility_set_value,
    accessibility_snapshot, SnapshotStore,
};
pub use clipboard::{
    read_clipboard, read_clipboard_html, read_clipboard_image, write_clipboard,
    write_clipboard_html, write_clipboard_image,
};
pub use file_system::{
    create_directory, delete_path, duplicate_path, move_path, patch_file, read_directory, read_file,
    search_files, stat_path, write_file,
};
pub use shared::wait;
pub use shell::{get_env, get_system_info, launch, process_info, process_kill, process_list, run_shell, set_env};
pub use window::{
    get_active_window, window_focus, window_list, window_move, window_resize, window_state,
};
