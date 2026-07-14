//! Workspace path resolution.
//!
//! Containment uses canonicalized ancestors + `starts_with`. On APFS
//! case-insensitive volumes, `canonicalize` normalizes case so prefix checks
//! stay meaningful; path string equality alone is still not a strong identity.

use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};

use crate::capabilities::error::{CommandError, ErrorCode};

pub const MAX_READ_BYTES: u64 = 1_048_576;

const OS_PERMISSION_HINT: &str =
    "On macOS, grant Files and Folders or Full Disk Access for Actuate in System Settings → Privacy & Security.";

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
        if error.kind() == ErrorKind::PermissionDenied {
            return CommandError::new(
                ErrorCode::OsPermissionDenied,
                format!(
                    "Workspace root is inaccessible: access denied by the OS. {OS_PERMISSION_HINT}"
                ),
            );
        }
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

/// True if a directory entry exists at `path`, including dangling symlinks.
pub fn path_lexists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

/// Map filesystem IO failures. Permission denials become `os_permission_denied`.
pub fn map_fs_io_error(error: std::io::Error, fallback: ErrorCode, context: &str) -> CommandError {
    match error.kind() {
        ErrorKind::NotFound => {
            CommandError::new(ErrorCode::NotFound, format!("{context}: not found"))
        }
        ErrorKind::PermissionDenied => CommandError::new(
            ErrorCode::OsPermissionDenied,
            format!("{context}: access denied by the OS. {OS_PERMISSION_HINT}"),
        ),
        _ => CommandError::new(fallback, format!("{context}: {error}")),
    }
}

/// If `path` is a symlink, require its resolved target to stay under the workspace root.
/// Use before read/write/patch that follow links.
pub fn ensure_io_target_within_root(workspace_root: &str, path: &Path) -> Result<(), CommandError> {
    let root = resolve_root(workspace_root)?;
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(()),
    };

    if !metadata.is_symlink() {
        return Ok(());
    }

    let target = path.canonicalize().map_err(|error| {
        CommandError::new(
            ErrorCode::PathTraversal,
            format!("Symlink target could not be resolved inside the workspace: {error}"),
        )
    })?;

    if !target.starts_with(&root) {
        return Err(CommandError::new(
            ErrorCode::PathTraversal,
            "Symlink target escapes the workspace root",
        ));
    }

    Ok(())
}

fn trim_relative_input(relative_path: &str) -> &str {
    // Windows: both separators. Unix: only `/` — `\` is a legal filename character.
    #[cfg(windows)]
    {
        relative_path.trim_start_matches(['/', '\\'])
    }
    #[cfg(not(windows))]
    {
        relative_path.trim_start_matches('/')
    }
}

fn join_within_root(root: &Path, relative_path: &str) -> Result<PathBuf, CommandError> {
    let relative = Path::new(trim_relative_input(relative_path));

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
    let normalized = normalize_leaf_path(&joined)?;

    if !normalized.starts_with(root) {
        return Err(CommandError::new(
            ErrorCode::PathTraversal,
            "Path escapes the workspace root",
        ));
    }

    Ok(normalized)
}

/// Canonicalize ancestors only. Keep the final component as-is so symlinks stay symlinks.
fn normalize_leaf_path(path: &Path) -> Result<PathBuf, CommandError> {
    let file_name = path
        .file_name()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidPath, "Path has no file name"))?;

    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new(ErrorCode::InvalidPath, "Path has no parent directory"))?;

    let canonical_parent = if parent.as_os_str().is_empty() {
        PathBuf::from(".")
    } else if parent.exists() {
        parent.canonicalize().map_err(|error| {
            map_fs_io_error(error, ErrorCode::IoError, "Failed to resolve parent path")
        })?
    } else {
        parent.to_path_buf()
    };

    Ok(canonical_parent.join(file_name))
}

pub fn to_workspace_relative(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    #[cfg(windows)]
    {
        relative.to_string_lossy().replace('\\', "/")
    }
    #[cfg(not(windows))]
    {
        // Keep `\` — it is not a separator and may appear in filenames.
        relative.to_string_lossy().into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io;

    fn temp_root() -> (PathBuf, PathBuf) {
        let cleanup = std::env::temp_dir().join(format!(
            "actuate-path-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::create_dir_all(&cleanup);
        let root = cleanup.canonicalize().expect("temp dir");
        (root, cleanup)
    }

    #[test]
    fn rejects_parent_segments() {
        let (root, cleanup) = temp_root();

        let error = join_within_root(&root, "../outside.txt").expect_err("should reject traversal");
        assert_eq!(error.code, "path_traversal");

        let _ = fs::remove_dir_all(cleanup);
    }

    #[test]
    fn resolve_preserves_symlink_leaf() {
        let (root, cleanup) = temp_root();
        fs::write(root.join("target.txt"), "data").expect("write target");

        #[cfg(unix)]
        std::os::unix::fs::symlink("target.txt", root.join("link.txt")).expect("symlink");

        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_file("target.txt", root.join("link.txt")).is_err() {
                let _ = fs::remove_dir_all(cleanup);
                return;
            }
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = fs::remove_dir_all(cleanup);
            return;
        }

        let resolved =
            resolve_workspace_path(root.to_str().expect("utf8"), "link.txt").expect("resolve link");
        assert_eq!(resolved, root.join("link.txt"));
        assert!(fs::symlink_metadata(&resolved).expect("lstat").is_symlink());

        let _ = fs::remove_dir_all(cleanup);
    }

    #[test]
    fn io_check_rejects_symlink_escaping_workspace() {
        let (root, cleanup) = temp_root();
        let outside = cleanup.with_extension("outside");
        fs::write(&outside, "secret").expect("write outside");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("escape.txt")).expect("symlink");

        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_file(&outside, root.join("escape.txt")).is_err() {
                let _ = fs::remove_file(&outside);
                let _ = fs::remove_dir_all(cleanup);
                return;
            }
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = fs::remove_file(&outside);
            let _ = fs::remove_dir_all(cleanup);
            return;
        }

        let resolved = resolve_workspace_path(root.to_str().expect("utf8"), "escape.txt")
            .expect("resolve keeps link path");
        let error = ensure_io_target_within_root(root.to_str().expect("utf8"), &resolved)
            .expect_err("escape");
        assert_eq!(error.code, "path_traversal");

        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(cleanup);
    }

    #[test]
    #[cfg(unix)]
    fn unix_keeps_backslash_in_filename() {
        let (root, cleanup) = temp_root();
        let name = "foo\\bar.txt";
        fs::write(root.join(name), "data").expect("write");

        let resolved = resolve_workspace_path(root.to_str().expect("utf8"), name).expect("resolve");
        assert_eq!(resolved.file_name().and_then(|v| v.to_str()), Some(name));
        assert_eq!(to_workspace_relative(&root, &resolved), name);

        let _ = fs::remove_dir_all(cleanup);
    }

    #[test]
    fn maps_permission_denied() {
        let error = map_fs_io_error(
            io::Error::new(ErrorKind::PermissionDenied, "denied"),
            ErrorCode::ReadFailed,
            "Failed to read file",
        );
        assert_eq!(error.code, "os_permission_denied");
        assert!(error.message.contains("System Settings"));
    }
}
