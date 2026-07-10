use crate::capabilities::path_utils::CommandError;

use super::types::ActiveWindowResult;

#[cfg(target_os = "windows")]
use super::platform::get_active_window_impl;

#[cfg(not(target_os = "windows"))]
use super::platform::unsupported_platform;

#[tauri::command]
pub fn get_active_window() -> Result<ActiveWindowResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return get_active_window_impl();
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
