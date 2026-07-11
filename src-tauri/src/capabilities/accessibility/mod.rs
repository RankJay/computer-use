mod arena;
mod budget;
mod commands;
mod state;
mod types;
mod worker;

#[cfg(target_os = "windows")]
mod windows_impl;

#[cfg(all(windows, feature = "a11y-bench"))]
pub mod bench;

pub use commands::{
    accessibility_click, accessibility_element_at_point, accessibility_expand_node,
    accessibility_find_element, accessibility_focus, accessibility_get_focused,
    accessibility_get_selection, accessibility_get_text, accessibility_get_value,
    accessibility_inspect, accessibility_invoke_action, accessibility_query,
    accessibility_right_click_element, accessibility_scroll_element, accessibility_send_keys,
    accessibility_set_value, accessibility_snapshot, accessibility_wait,
};
pub use state::SnapshotStore;
