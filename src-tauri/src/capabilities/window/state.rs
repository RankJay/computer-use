#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::CommandError;

use super::types::{WindowStateOp, WindowStateResult};

#[cfg(target_os = "windows")]
use super::platform::window_state_impl;

#[tauri::command]
pub fn window_state(hwnd: i64, op: WindowStateOp) -> Result<WindowStateResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return window_state_impl(hwnd, op);
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Window management"))
}
