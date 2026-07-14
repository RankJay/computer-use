use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;
use std::fs;

#[tauri::command]
pub fn delete_path(path: String, workspace_root: String) -> Result<(), CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    let metadata = fs::symlink_metadata(&resolved).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::IoError, "Failed to read path metadata")
    })?;

    // Symlinks are never directories in lstat metadata on Unix; remove_file unlinks the link.
    // On Windows, directory symlinks report is_dir() from symlink_metadata — remove_dir.
    if metadata.is_symlink() {
        fs::remove_file(&resolved)
            .or_else(|error| {
                if metadata.is_dir() {
                    fs::remove_dir(&resolved)
                } else {
                    Err(error)
                }
            })
            .map_err(|error| {
                path_utils::map_fs_io_error(
                    error,
                    ErrorCode::DeleteFailed,
                    "Failed to delete symlink",
                )
            })?;
    } else if metadata.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::DeleteFailed,
                "Failed to delete directory",
            )
        })?;
    } else {
        fs::remove_file(&resolved).map_err(|error| {
            path_utils::map_fs_io_error(error, ErrorCode::DeleteFailed, "Failed to delete file")
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
    fn deletes_symlink_not_target() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("target.txt"), "keep me").expect("write target");

        #[cfg(unix)]
        std::os::unix::fs::symlink("target.txt", root.join("link.txt")).expect("symlink");

        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_file("target.txt", root.join("link.txt")).is_err() {
                cleanup_workspace(&cleanup);
                return;
            }
        }

        #[cfg(not(any(unix, windows)))]
        {
            cleanup_workspace(&cleanup);
            return;
        }

        delete_path("link.txt".to_string(), root.to_string_lossy().to_string())
            .expect("delete symlink");

        assert!(!path_utils::path_lexists(&root.join("link.txt")));
        assert_eq!(
            fs::read_to_string(root.join("target.txt")).expect("target intact"),
            "keep me"
        );
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
