use crate::capabilities::path_utils::CommandError;

use super::types::{WindowStateOp, WindowStateResult};

#[cfg(target_os = "windows")]
use super::platform::window_state_impl;

#[cfg(not(target_os = "windows"))]
use super::platform::unsupported_platform;

#[tauri::command]
pub fn window_state(hwnd: i64, op: WindowStateOp) -> Result<WindowStateResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return window_state_impl(hwnd, op);
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
