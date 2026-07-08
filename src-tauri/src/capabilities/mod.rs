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
pub use file_system::{delete_file, read_file, search_files, write_file};
pub use shell::{get_system_info, run_shell};
