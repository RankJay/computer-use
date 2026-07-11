mod arena;
mod budget;
mod commands;
mod outline;
mod provider;
mod query_match;
mod state;
mod types;
mod worker;

#[cfg(windows)]
mod uia;

#[cfg(not(windows))]
mod unsupported;

#[cfg(test)]
mod fake;

#[cfg(all(windows, feature = "a11y-bench"))]
pub mod bench;

#[cfg(windows)]
pub mod live_smoke;

pub use commands::{
    accessibility_click, accessibility_element_at_point, accessibility_find_element,
    accessibility_focus, accessibility_get_focused, accessibility_get_selection,
    accessibility_get_text, accessibility_get_value, accessibility_inspect,
    accessibility_invoke_action, accessibility_query, accessibility_right_click_element,
    accessibility_scroll_element, accessibility_send_keys, accessibility_set_value,
    accessibility_snapshot, accessibility_wait,
};
pub use state::SnapshotStore;

#[cfg(windows)]
pub use live_smoke as a11y_live_smoke;

use provider::AccessibilityProvider;

/// Process-wide accessibility provider. Single `#[cfg]` switch for the adapter.
pub fn provider() -> &'static dyn AccessibilityProvider {
    #[cfg(windows)]
    {
        static PROVIDER: uia::UiaProvider = uia::UiaProvider;
        &PROVIDER
    }
    #[cfg(not(windows))]
    {
        static PROVIDER: unsupported::UnsupportedAccessibilityProvider =
            unsupported::UnsupportedAccessibilityProvider;
        &PROVIDER
    }
}
