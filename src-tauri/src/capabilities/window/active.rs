#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::CommandError;

use super::types::ActiveWindowResult;

#[cfg(target_os = "windows")]
use super::platform::get_active_window_impl;

#[tauri::command]
pub fn get_active_window() -> Result<ActiveWindowResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return get_active_window_impl();
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Window management"))
}
