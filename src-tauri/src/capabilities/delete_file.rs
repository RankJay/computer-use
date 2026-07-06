use std::fs;

use super::path_utils::{self, CommandError};

#[tauri::command]
pub fn delete_file(path: String, workspace_root: String) -> Result<(), CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    if !resolved.exists() {
        return Err(CommandError::new("not_found", "File does not exist"));
    }

    if resolved.is_dir() {
        return Err(CommandError::new(
            "not_a_file",
            "Path is a directory, not a file",
        ));
    }

    fs::remove_file(&resolved).map_err(|error| {
        CommandError::new("delete_failed", format!("Failed to delete file: {error}"))
    })?;

    Ok(())
}
