use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePathResult {
    pub from: String,
    pub to: String,
    pub kind: String,
}

fn path_kind(metadata: &fs::Metadata) -> &'static str {
    if metadata.is_symlink() {
        "symlink"
    } else if metadata.is_dir() {
        "directory"
    } else {
        "file"
    }
}

fn copy_symlink(
    source: &Path,
    destination: &Path,
    source_meta: &fs::Metadata,
) -> Result<(), CommandError> {
    let target = fs::read_link(source).map_err(|error| {
        path_utils::map_fs_io_error(
            error,
            ErrorCode::DuplicateFailed,
            "Failed to read symlink target",
        )
    })?;

    #[cfg(unix)]
    {
        let _ = source_meta;
        std::os::unix::fs::symlink(&target, destination).map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::DuplicateFailed,
                "Failed to recreate symlink",
            )
        })?;
    }

    #[cfg(windows)]
    {
        let result = if source_meta.is_dir() {
            std::os::windows::fs::symlink_dir(&target, destination)
        } else {
            std::os::windows::fs::symlink_file(&target, destination)
        };
        result.map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::DuplicateFailed,
                "Failed to recreate symlink",
            )
        })?;
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = (destination, source_meta, target);
        return Err(CommandError::new(
            ErrorCode::DuplicateFailed,
            "Symlink duplication is not supported on this platform",
        ));
    }

    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), CommandError> {
    fs::create_dir_all(destination).map_err(|error| {
        path_utils::map_fs_io_error(
            error,
            ErrorCode::DuplicateFailed,
            "Failed to create destination directory",
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        path_utils::map_fs_io_error(
            error,
            ErrorCode::DuplicateFailed,
            "Failed to read source directory",
        )
    })? {
        let entry = entry.map_err(|error| {
            path_utils::map_fs_io_error(error, ErrorCode::DuplicateFailed, "Failed to read entry")
        })?;
        let entry_path = entry.path();
        let target_path = destination.join(entry.file_name());

        let metadata = fs::symlink_metadata(&entry_path).map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::DuplicateFailed,
                "Failed to read entry metadata",
            )
        })?;

        if metadata.is_symlink() {
            copy_symlink(&entry_path, &target_path, &metadata)?;
        } else if metadata.is_dir() {
            copy_directory(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path).map_err(|error| {
                path_utils::map_fs_io_error(
                    error,
                    ErrorCode::DuplicateFailed,
                    "Failed to copy file",
                )
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn duplicate_path(
    from: String,
    to: String,
    workspace_root: String,
) -> Result<DuplicatePathResult, CommandError> {
    let source = path_utils::resolve_workspace_path(&workspace_root, &from)?;
    let destination = path_utils::resolve_workspace_path(&workspace_root, &to)?;

    let metadata = fs::symlink_metadata(&source).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::IoError, "Failed to read source metadata")
    })?;

    if path_utils::path_lexists(&destination) {
        return Err(CommandError::new(
            ErrorCode::DestExists,
            "Destination path already exists",
        ));
    }

    let kind = path_kind(&metadata);

    if metadata.is_symlink() {
        if let Some(parent) = destination.parent() {
            if !parent.exists() {
                return Err(CommandError::new(
                    ErrorCode::ParentMissing,
                    "Destination parent directory does not exist",
                ));
            }
        }
        copy_symlink(&source, &destination, &metadata)?;
    } else if metadata.is_dir() {
        copy_directory(&source, &destination)?;
    } else {
        if let Some(parent) = destination.parent() {
            if !parent.exists() {
                return Err(CommandError::new(
                    ErrorCode::ParentMissing,
                    "Destination parent directory does not exist",
                ));
            }
        }

        fs::copy(&source, &destination).map_err(|error| {
            path_utils::map_fs_io_error(error, ErrorCode::DuplicateFailed, "Failed to copy file")
        })?;
    }

    Ok(DuplicatePathResult {
        from,
        to,
        kind: kind.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn duplicates_file() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("source.txt"), "copy me").expect("write source");

        duplicate_path(
            "source.txt".to_string(),
            "copy.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("duplicate file");

        assert_eq!(
            fs::read_to_string(root.join("copy.txt")).expect("read copy"),
            "copy me"
        );
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn duplicates_directory_recursively() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir_all(root.join("src/nested")).expect("create nested");
        fs::write(root.join("src/nested/file.txt"), "nested").expect("write nested file");

        duplicate_path(
            "src".to_string(),
            "dst".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("duplicate directory");

        assert_eq!(
            fs::read_to_string(root.join("dst/nested/file.txt")).expect("read nested copy"),
            "nested"
        );
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn duplicates_symlink_without_following() {
        let (root, cleanup) = temp_workspace();
        let outside = cleanup.with_extension("outside");
        fs::write(&outside, "secret").expect("write outside");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("escape.txt")).expect("symlink");

        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_file(&outside, root.join("escape.txt")).is_err() {
                let _ = fs::remove_file(&outside);
                cleanup_workspace(&cleanup);
                return;
            }
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = fs::remove_file(&outside);
            cleanup_workspace(&cleanup);
            return;
        }

        let result = duplicate_path(
            "escape.txt".to_string(),
            "escape-copy.txt".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("duplicate symlink");

        assert_eq!(result.kind, "symlink");
        assert!(fs::symlink_metadata(root.join("escape-copy.txt"))
            .expect("lstat copy")
            .is_symlink());
        assert_eq!(
            fs::read_link(root.join("escape-copy.txt")).expect("read link"),
            outside
        );
        // Content was not materialized as a regular file inside the workspace.
        assert!(!fs::symlink_metadata(root.join("escape-copy.txt"))
            .expect("lstat")
            .is_file());

        let _ = fs::remove_file(&outside);
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn duplicates_directory_recreates_nested_symlink() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir(root.join("src")).expect("create src");
        fs::write(root.join("src/target.txt"), "data").expect("write target");

        #[cfg(unix)]
        std::os::unix::fs::symlink("target.txt", root.join("src/link.txt")).expect("symlink");

        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_file("target.txt", root.join("src/link.txt")).is_err()
            {
                cleanup_workspace(&cleanup);
                return;
            }
        }

        #[cfg(not(any(unix, windows)))]
        {
            cleanup_workspace(&cleanup);
            return;
        }

        duplicate_path(
            "src".to_string(),
            "dst".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("duplicate dir");

        assert!(fs::symlink_metadata(root.join("dst/link.txt"))
            .expect("lstat")
            .is_symlink());
        assert_eq!(
            fs::read_link(root.join("dst/link.txt")).expect("read link"),
            Path::new("target.txt")
        );
        cleanup_workspace(&cleanup);
    }
}
