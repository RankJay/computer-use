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

fn copy_directory(source: &Path, destination: &Path) -> Result<(), CommandError> {
    fs::create_dir_all(destination).map_err(|error| {
        CommandError::new(
            ErrorCode::DuplicateFailed,
            format!("Failed to create destination directory: {error}"),
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        CommandError::new(
            ErrorCode::DuplicateFailed,
            format!("Failed to read source directory: {error}"),
        )
    })? {
        let entry = entry.map_err(|error| {
            CommandError::new(
                ErrorCode::DuplicateFailed,
                format!("Failed to read entry: {error}"),
            )
        })?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let target_path = destination.join(&file_name);

        let metadata = entry.metadata().map_err(|error| {
            CommandError::new(
                ErrorCode::DuplicateFailed,
                format!("Failed to read entry metadata: {error}"),
            )
        })?;

        if metadata.is_dir() {
            copy_directory(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path).map_err(|error| {
                CommandError::new(
                    ErrorCode::DuplicateFailed,
                    format!("Failed to copy file: {error}"),
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

    if !source.exists() {
        return Err(CommandError::new(
            ErrorCode::NotFound,
            "Source path does not exist",
        ));
    }

    if destination.exists() {
        return Err(CommandError::new(
            ErrorCode::DestExists,
            "Destination path already exists",
        ));
    }

    let metadata = fs::metadata(&source).map_err(|error| {
        CommandError::new(
            ErrorCode::IoError,
            format!("Failed to read source metadata: {error}"),
        )
    })?;

    let kind = if metadata.is_dir() {
        "directory"
    } else {
        "file"
    };

    if metadata.is_dir() {
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
            CommandError::new(
                ErrorCode::DuplicateFailed,
                format!("Failed to copy file: {error}"),
            )
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
}
