use std::fs;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils::{self, MAX_READ_BYTES};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileResult {
    pub path: String,
    pub content: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn read_file(path: String, workspace_root: String) -> Result<ReadFileResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;
    path_utils::ensure_io_target_within_root(&workspace_root, &resolved)?;

    let metadata = fs::metadata(&resolved).map_err(|error| {
        CommandError::new(ErrorCode::NotFound, format!("File not found: {error}"))
    })?;

    if !metadata.is_file() {
        return Err(CommandError::new(ErrorCode::NotAFile, "Path is not a file"));
    }

    if metadata.len() > MAX_READ_BYTES {
        return Err(CommandError::new(
            ErrorCode::FileTooLarge,
            format!("File exceeds {MAX_READ_BYTES} byte read limit"),
        ));
    }

    let content = fs::read_to_string(&resolved).map_err(|error| {
        CommandError::new(
            ErrorCode::ReadFailed,
            format!("Failed to read file: {error}"),
        )
    })?;

    Ok(ReadFileResult {
        path,
        content,
        bytes: metadata.len(),
    })
}
