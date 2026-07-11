#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::CommandError;

use super::types::WindowActionResult;

#[cfg(target_os = "windows")]
use super::platform::focus_window_impl;

#[tauri::command]
pub fn window_focus(hwnd: i64) -> Result<WindowActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return focus_window_impl(hwnd);
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Window management"))
}
