mod commands;
mod manager;
mod types;

#[cfg(windows)]
mod win32;

#[cfg(not(windows))]
mod unsupported;

pub use commands::{
    get_active_window, window_focus, window_list, window_move, window_resize, window_state,
};
pub use types::WindowId;

use manager::WindowManager;

/// Process-wide window manager. Single `#[cfg]` switch for the adapter.
pub fn manager() -> &'static dyn WindowManager {
    #[cfg(windows)]
    {
        static MANAGER: win32::Win32WindowManager = win32::Win32WindowManager;
        &MANAGER
    }
    #[cfg(not(windows))]
    {
        static MANAGER: unsupported::UnsupportedWindowManager =
            unsupported::UnsupportedWindowManager;
        &MANAGER
    }
}
