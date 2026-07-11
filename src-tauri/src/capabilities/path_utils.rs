use std::path::{Component, Path, PathBuf};

use crate::capabilities::error::{CommandError, ErrorCode};

pub const MAX_READ_BYTES: u64 = 1_048_576;

pub fn resolve_root(workspace_root: &str) -> Result<PathBuf, CommandError> {
    let trimmed = workspace_root.trim();
    if trimmed.is_empty() {
        return Err(CommandError::new(
            ErrorCode::WorkspaceUnconfigured,
            "Workspace root is not configured in Settings",
        ));
    }

    let root = PathBuf::from(trimmed);
    if !root.is_absolute() {
        return Err(CommandError::new(
            ErrorCode::WorkspaceInvalid,
            "Workspace root must be an absolute path",
        ));
    }

    root.canonicalize().map_err(|error| {
        CommandError::new(
            ErrorCode::WorkspaceInvalid,
            format!("Workspace root does not exist: {error}"),
        )
    })
}

pub fn resolve_workspace_path(
    workspace_root: &str,
    relative_path: &str,
) -> Result<PathBuf, CommandError> {
    let root = resolve_root(workspace_root)?;
    join_within_root(&root, relative_path)
}

fn join_within_root(root: &Path, relative_path: &str) -> Result<PathBuf, CommandError> {
    let relative = Path::new(relative_path.trim_start_matches(['/', '\\']));

    if relative.as_os_str().is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidPath,
            "Path must not be empty",
        ));
    }

    for component in relative.components() {
        if matches!(component, Component::ParentDir) {
            return Err(CommandError::new(
                ErrorCode::PathTraversal,
                "Path must not contain parent directory segments",
            ));
        }
    }

    let joined = root.join(relative);
    let normalized = normalize_existing_path(&joined)?;

    if !normalized.starts_with(root) {
        return Err(CommandError::new(
            ErrorCode::PathTraversal,
            "Path escapes the workspace root",
        ));
    }

    Ok(normalized)
}

fn normalize_existing_path(path: &Path) -> Result<PathBuf, CommandError> {
    if path.exists() {
        return path.canonicalize().map_err(|error| {
            CommandError::new(
                ErrorCode::IoError,
                format!("Failed to resolve path: {error}"),
            )
        });
    }

    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidPath, "Path has no parent directory"))?;

    let file_name = path
        .file_name()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidPath, "Path has no file name"))?;

    let canonical_parent = if parent.as_os_str().is_empty() {
        PathBuf::from(".")
    } else if parent.exists() {
        parent.canonicalize().map_err(|error| {
            CommandError::new(
                ErrorCode::IoError,
                format!("Failed to resolve parent path: {error}"),
            )
        })?
    } else {
        parent.to_path_buf()
    };

    Ok(canonical_parent.join(file_name))
}

pub fn to_workspace_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_parent_segments() {
        let temp = std::env::temp_dir().join(format!("actuate-path-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&temp);
        let root = temp.canonicalize().expect("temp dir");

        let error = join_within_root(&root, "../outside.txt").expect_err("should reject traversal");
        assert_eq!(error.code, "path_traversal");

        let _ = fs::remove_dir_all(temp);
    }
}
