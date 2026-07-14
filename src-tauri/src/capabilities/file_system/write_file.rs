use std::fs;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;

#[tauri::command]
pub fn write_file(
    path: String,
    content: String,
    workspace_root: String,
) -> Result<(), CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;
    path_utils::ensure_io_target_within_root(&workspace_root, &resolved)?;

    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::WriteFailed,
                "Failed to create directories",
            )
        })?;
    }

    fs::write(&resolved, content).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::WriteFailed, "Failed to write file")
    })?;

    Ok(())
}
