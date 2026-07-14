use serde::Serialize;
use std::fs;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;

const MAX_DIRECTORY_ENTRIES: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadDirectoryResult {
    pub path: String,
    pub entries: Vec<DirectoryEntry>,
}

fn entry_kind(metadata: &fs::Metadata) -> &'static str {
    if metadata.is_symlink() {
        "symlink"
    } else if metadata.is_dir() {
        "directory"
    } else {
        "file"
    }
}

#[tauri::command]
pub fn read_directory(
    path: String,
    workspace_root: String,
) -> Result<ReadDirectoryResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    let metadata = fs::symlink_metadata(&resolved).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::IoError, "Failed to read path metadata")
    })?;

    if metadata.is_symlink() {
        path_utils::ensure_io_target_within_root(&workspace_root, &resolved)?;
    } else if !metadata.is_dir() {
        return Err(CommandError::new(
            ErrorCode::NotADirectory,
            "Path is not a directory",
        ));
    }

    if !resolved.is_dir() {
        return Err(CommandError::new(
            ErrorCode::NotADirectory,
            "Path is not a directory",
        ));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&resolved).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::ReadFailed, "Failed to read directory")
    })? {
        let entry = entry.map_err(|error| {
            path_utils::map_fs_io_error(error, ErrorCode::ReadFailed, "Failed to read entry")
        })?;
        let metadata = fs::symlink_metadata(entry.path()).map_err(|error| {
            path_utils::map_fs_io_error(
                error,
                ErrorCode::ReadFailed,
                "Failed to read entry metadata",
            )
        })?;

        entries.push(DirectoryEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            kind: entry_kind(&metadata).to_string(),
            size_bytes: if metadata.is_file() {
                Some(metadata.len())
            } else {
                None
            },
        });

        if entries.len() > MAX_DIRECTORY_ENTRIES {
            return Err(CommandError::new(
                ErrorCode::TooManyEntries,
                format!("Directory exceeds {MAX_DIRECTORY_ENTRIES} entry limit"),
            ));
        }
    }

    entries.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ReadDirectoryResult { path, entries })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn lists_entries_sorted() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir_all(root.join("dir")).expect("create dir");
        fs::write(root.join("b.txt"), "b").expect("write b");
        fs::write(root.join("a.txt"), "a").expect("write a");

        let result =
            read_directory(".".to_string(), root.to_string_lossy().to_string()).expect("read dir");

        assert_eq!(
            result
                .entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["a.txt", "b.txt", "dir"]
        );
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn lists_symlink_entries_as_symlink() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("target.txt"), "data").expect("write target");

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

        let result =
            read_directory(".".to_string(), root.to_string_lossy().to_string()).expect("read dir");
        let link = result
            .entries
            .iter()
            .find(|entry| entry.name == "link.txt")
            .expect("link entry");
        assert_eq!(link.kind, "symlink");
        assert!(link.size_bytes.is_none());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn rejects_file_path() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("file.txt"), "x").expect("write file");

        let error = read_directory("file.txt".to_string(), root.to_string_lossy().to_string())
            .expect_err("not a directory");

        assert_eq!(error.code, "not_a_directory");
        cleanup_workspace(&cleanup);
    }
}
