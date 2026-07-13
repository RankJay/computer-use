use std::fs;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovePathResult {
    pub from: String,
    pub to: String,
}

#[tauri::command]
pub fn move_path(
    from: String,
    to: String,
    workspace_root: String,
) -> Result<MovePathResult, CommandError> {
    let source = path_utils::resolve_workspace_path(&workspace_root, &from)?;
    let destination = path_utils::resolve_workspace_path(&workspace_root, &to)?;

    if !path_utils::path_lexists(&source) {
        return Err(CommandError::new(
            ErrorCode::NotFound,
            "Source path does not exist",
        ));
    }

    if path_utils::path_lexists(&destination) {
        return Err(CommandError::new(
            ErrorCode::DestExists,
            "Destination path already exists",
        ));
    }

    if let Some(parent) = destination.parent() {
        if !parent.exists() {
            return Err(CommandError::new(
                ErrorCode::ParentMissing,
                "Destination parent directory does not exist",
            ));
        }
    }

    fs::rename(&source, &destination).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::MoveFailed, "Failed to move path")
    })?;

    Ok(MovePathResult { from, to })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn moves_file() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("old.txt"), "data").expect("write file");

        move_path(
            "old.txt".to_string(),
            "new.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("move file");

        assert!(!root.join("old.txt").exists());
        assert!(root.join("new.txt").exists());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn rejects_existing_destination() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("a.txt"), "a").expect("write a");
        fs::write(root.join("b.txt"), "b").expect("write b");

        let error = move_path(
            "a.txt".to_string(),
            "b.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect_err("dest exists");

        assert_eq!(error.code, "dest_exists");
        cleanup_workspace(&cleanup);
    }
}
