mod path_utils;

mod accessibility;
mod clipboard;
mod file_system;
mod keyboard;
mod mouse;
mod screenshot;
mod shared;
mod shell;
mod window;

pub use accessibility::{
    accessibility_click, accessibility_expand_node, accessibility_find_element, accessibility_focus,
    accessibility_list_windows, accessibility_send_keys, accessibility_set_value, accessibility_snapshot,
    SnapshotStore,
};
pub use clipboard::{read_clipboard, write_clipboard};
pub use file_system::{
    create_directory, delete_path, duplicate_path, move_path, patch_file, read_directory, read_file,
    search_files, stat_path, write_file,
};
pub use shared::wait;
pub use shell::{get_system_info, run_shell};
