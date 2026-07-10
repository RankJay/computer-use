use crate::capabilities::path_utils::CommandError;

use super::types::WindowActionResult;

#[cfg(target_os = "windows")]
use super::platform::focus_window_impl;

#[cfg(not(target_os = "windows"))]
use super::platform::unsupported_platform;

#[tauri::command]
pub fn window_focus(hwnd: i64) -> Result<WindowActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return focus_window_impl(hwnd);
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
