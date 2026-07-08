// TODO: implement real log directory open via app_data_dir/logs.
#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    Ok(())
}

// TODO: implement real log file deletion from app_data_dir/logs.
#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    Ok(())
}

// TODO: implement real session reset once SessionProvider exists.
#[tauri::command]
pub fn reset_session() -> Result<(), String> {
    Ok(())
}
