use std::fs;

use serde::Serialize;

use super::path_utils::{self, CommandError, MAX_READ_BYTES};

#[derive(Debug, Serialize)]
pub struct ReadFileResult {
    pub path: String,
    pub content: String,
    pub bytes: u64,
}

#[tauri::command]
pub fn read_file(path: String, workspace_root: String) -> Result<ReadFileResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    let metadata = fs::metadata(&resolved)
        .map_err(|error| CommandError::new("not_found", format!("File not found: {error}")))?;

    if !metadata.is_file() {
        return Err(CommandError::new("not_a_file", "Path is not a file"));
    }

    if metadata.len() > MAX_READ_BYTES {
        return Err(CommandError::new(
            "file_too_large",
            format!("File exceeds {MAX_READ_BYTES} byte read limit"),
        ));
    }

    let content = fs::read_to_string(&resolved).map_err(|error| {
        CommandError::new("read_failed", format!("Failed to read file: {error}"))
    })?;

    Ok(ReadFileResult {
        path,
        content,
        bytes: metadata.len(),
    })
}
