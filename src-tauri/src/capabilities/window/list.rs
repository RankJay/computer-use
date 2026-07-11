#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::CommandError;

use super::types::{WindowListResult, TIMEOUT_LIST_WINDOWS_MS};

#[cfg(target_os = "windows")]
use super::platform::{list_windows_impl, run_with_list_timeout};

#[tauri::command]
pub fn window_list() -> Result<WindowListResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        return run_with_list_timeout(TIMEOUT_LIST_WINDOWS_MS, list_windows_impl);
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Window management"))
}
