use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

fn logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logs dir: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let dir = logs_dir(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Failed to open logs folder: {e}"))
}

#[tauri::command]
pub fn clear_logs(app: AppHandle) -> Result<(), String> {
    let dir = logs_dir(&app)?;
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read logs dir: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read log entry: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to remove log dir {}: {e}", path.display()))?;
        } else {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove log file {}: {e}", path.display()))?;
        }
    }

    Ok(())
}

/// Session reset is owned by the frontend (`resetActiveSessionEngine`).
/// This command exists so the invoke contract stays stable.
#[tauri::command]
pub fn reset_session() -> Result<(), String> {
    Ok(())
}
