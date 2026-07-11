#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::CommandError;

use super::types::WindowMoveResult;

#[cfg(target_os = "windows")]
use super::platform::move_window_impl;

#[tauri::command]
pub fn window_move(hwnd: i64, x: i32, y: i32) -> Result<WindowMoveResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return move_window_impl(hwnd, x, y);
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Window management"))
}
