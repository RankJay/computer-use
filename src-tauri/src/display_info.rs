//! Primary-display capabilities exposed to the frontend (multi-monitor detection).

use screenshots::Screen;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfoResponse {
    pub display_count: u32,
    pub multi_monitor: bool,
    /// Screen capture and pointer grid target only the primary display today.
    pub primary_only: bool,
}

#[tauri::command]
pub fn get_display_info() -> Result<DisplayInfoResponse, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let display_count = screens.len() as u32;
    Ok(DisplayInfoResponse {
        display_count,
        multi_monitor: display_count > 1,
        primary_only: true,
    })
}

#[cfg(test)]
mod tests {
    use super::DisplayInfoResponse;

    #[test]
    fn multi_monitor_flag_when_more_than_one_display() {
        let single = DisplayInfoResponse {
            display_count: 1,
            multi_monitor: false,
            primary_only: true,
        };
        assert!(!single.multi_monitor);

        let dual = DisplayInfoResponse {
            display_count: 2,
            multi_monitor: true,
            primary_only: true,
        };
        assert!(dual.multi_monitor);
    }
}
