use std::fs;

use serde::Serialize;

use crate::capabilities::path_utils::{self, CommandError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectoryResult {
    pub path: String,
    pub created: bool,
}

#[tauri::command]
pub fn create_directory(
    path: String,
    workspace_root: String,
    recursive: Option<bool>,
) -> Result<CreateDirectoryResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    if resolved.exists() {
        return Err(CommandError::new(
            "already_exists",
            "Directory already exists",
        ));
    }

    if recursive.unwrap_or(false) {
        fs::create_dir_all(&resolved).map_err(|error| {
            CommandError::new(
                "create_failed",
                format!("Failed to create directories: {error}"),
            )
        })?;
    } else {
        fs::create_dir(&resolved).map_err(|error| {
            CommandError::new(
                "create_failed",
                format!("Failed to create directory: {error}"),
            )
        })?;
    }

    Ok(CreateDirectoryResult {
        path,
        created: true,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn creates_single_directory() {
        let (root, cleanup) = temp_workspace();

        let result = create_directory(
            "new-dir".to_string(),
            root.to_string_lossy().to_string(),
            None,
        )
        .expect("create directory");

        assert!(result.created);
        assert!(root.join("new-dir").is_dir());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn creates_nested_directories_recursively() {
        let (root, cleanup) = temp_workspace();

        create_directory(
            "a/b/c".to_string(),
            root.to_string_lossy().to_string(),
            Some(true),
        )
        .expect("create nested directories");

        assert!(root.join("a/b/c").is_dir());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn rejects_existing_directory() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir(root.join("exists")).expect("create dir");

        let error = create_directory(
            "exists".to_string(),
            root.to_string_lossy().to_string(),
            None,
        )
        .expect_err("already exists");

        assert_eq!(error.code, "already_exists");
        cleanup_workspace(&cleanup);
    }
}
