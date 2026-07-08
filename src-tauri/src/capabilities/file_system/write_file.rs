use std::fs;

use crate::capabilities::path_utils::{self, CommandError};

#[tauri::command]
pub fn write_file(
    path: String,
    content: String,
    workspace_root: String,
) -> Result<(), CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            CommandError::new(
                "write_failed",
                format!("Failed to create directories: {error}"),
            )
        })?;
    }

    fs::write(&resolved, content).map_err(|error| {
        CommandError::new("write_failed", format!("Failed to write file: {error}"))
    })?;

    Ok(())
}
