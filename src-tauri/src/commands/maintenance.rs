use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::capabilities::error::{CommandError, ErrorCode};

fn logs_dir(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            CommandError::new(ErrorCode::CreateFailed, "Failed to resolve app data dir")
                .with_details(e.to_string())
        })?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|e| {
        CommandError::new(ErrorCode::CreateFailed, "Failed to create logs dir")
            .with_details(e.to_string())
    })?;
    Ok(dir)
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Result<(), CommandError> {
    let dir = logs_dir(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| {
            CommandError::new(ErrorCode::OpenFailed, "Failed to open logs folder")
                .with_details(e.to_string())
        })
}

#[tauri::command]
pub fn clear_logs(app: AppHandle) -> Result<(), CommandError> {
    let dir = logs_dir(&app)?;
    let entries = fs::read_dir(&dir).map_err(|e| {
        CommandError::new(ErrorCode::ReadFailed, "Failed to read logs dir")
            .with_details(e.to_string())
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| {
            CommandError::new(ErrorCode::ReadFailed, "Failed to read log entry")
                .with_details(e.to_string())
        })?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| {
                CommandError::new(
                    ErrorCode::DeleteFailed,
                    format!("Failed to remove log dir {}", path.display()),
                )
                .with_details(e.to_string())
            })?;
        } else {
            fs::remove_file(&path).map_err(|e| {
                CommandError::new(
                    ErrorCode::DeleteFailed,
                    format!("Failed to remove log file {}", path.display()),
                )
                .with_details(e.to_string())
            })?;
        }
    }

    Ok(())
}

/// Session reset is owned by the frontend (`resetActiveSessionEngine`).
/// This command exists so the invoke contract stays stable.
#[tauri::command]
pub fn reset_session() -> Result<(), CommandError> {
    Ok(())
}
