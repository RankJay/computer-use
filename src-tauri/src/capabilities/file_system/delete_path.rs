use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;
use std::fs;

#[tauri::command]
pub fn delete_path(path: String, workspace_root: String) -> Result<(), CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    if !resolved.exists() {
        return Err(CommandError::new(
            ErrorCode::NotFound,
            "Path does not exist",
        ));
    }

    let metadata = fs::symlink_metadata(&resolved).map_err(|error| {
        CommandError::new(
            ErrorCode::IoError,
            format!("Failed to read path metadata: {error}"),
        )
    })?;

    if metadata.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|error| {
            CommandError::new(
                ErrorCode::DeleteFailed,
                format!("Failed to delete directory: {error}"),
            )
        })?;
    } else {
        fs::remove_file(&resolved).map_err(|error| {
            CommandError::new(
                ErrorCode::DeleteFailed,
                format!("Failed to delete file: {error}"),
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn deletes_file() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("note.txt"), "hello").expect("write file");

        delete_path("note.txt".to_string(), root.to_string_lossy().to_string())
            .expect("delete file");

        assert!(!root.join("note.txt").exists());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn deletes_non_empty_directory() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir_all(root.join("nested")).expect("create dir");
        fs::write(root.join("nested/child.txt"), "child").expect("write child");

        delete_path("nested".to_string(), root.to_string_lossy().to_string())
            .expect("delete directory");

        assert!(!root.join("nested").exists());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn rejects_missing_path() {
        let (root, cleanup) = temp_workspace();
        let error = delete_path(
            "missing.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect_err("missing path");

        assert_eq!(error.code, "not_found");
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn rejects_path_traversal() {
        let (root, cleanup) = temp_workspace();
        let error = delete_path(
            "../outside.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect_err("traversal");

        assert_eq!(error.code, "path_traversal");
        cleanup_workspace(&cleanup);
    }
}
