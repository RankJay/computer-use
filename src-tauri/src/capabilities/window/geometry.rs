use crate::capabilities::path_utils::CommandError;

use super::types::WindowMoveResult;

#[cfg(target_os = "windows")]
use super::platform::move_window_impl;

#[cfg(not(target_os = "windows"))]
use super::platform::unsupported_platform;

#[tauri::command]
pub fn window_move(hwnd: i64, x: i32, y: i32) -> Result<WindowMoveResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return move_window_impl(hwnd, x, y);
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
