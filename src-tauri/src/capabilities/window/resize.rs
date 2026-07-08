use crate::capabilities::path_utils::CommandError;

use super::types::WindowResizeResult;

#[cfg(target_os = "windows")]
use super::platform::resize_window_impl;

#[cfg(not(target_os = "windows"))]
use super::platform::unsupported_platform;

#[tauri::command]
pub fn window_resize(hwnd: i64, width: i32, height: i32) -> Result<WindowResizeResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return resize_window_impl(hwnd, width, height);
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
