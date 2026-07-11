use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::SystemTime;

use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatPathResult {
    pub path: String,
    pub kind: String,
    pub size_bytes: u64,
    pub modified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    pub readonly: bool,
    pub mode: Option<String>,
    pub executable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symlink_target: Option<String>,
}

fn format_timestamp(time: SystemTime) -> Option<String> {
    let datetime: OffsetDateTime = time.try_into().ok()?;
    datetime.format(&Rfc3339).ok()
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

fn unix_mode(metadata: &fs::Metadata) -> Option<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        Some(format!("{:04o}", metadata.permissions().mode() & 0o7777))
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        None
    }
}

fn is_executable(path: &Path, metadata: &fs::Metadata) -> bool {
    if metadata.is_dir() || metadata.is_symlink() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return metadata.permissions().mode() & 0o100 != 0;
    }

    #[cfg(windows)]
    {
        let _ = metadata;
        matches!(
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase())
                .as_deref(),
            Some("exe" | "bat" | "cmd" | "ps1" | "com")
        )
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = (path, metadata);
        false
    }
}

#[tauri::command]
pub fn stat_path(path: String, workspace_root: String) -> Result<StatPathResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    let metadata = fs::symlink_metadata(&resolved).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            CommandError::new(ErrorCode::NotFound, "Path does not exist")
        } else {
            CommandError::new(
                ErrorCode::IoError,
                format!("Failed to read path metadata: {error}"),
            )
        }
    })?;

    let kind = path_kind(&metadata);
    let symlink_target = if metadata.is_symlink() {
        Some(
            fs::read_link(&resolved)
                .map_err(|error| {
                    CommandError::new(
                        ErrorCode::IoError,
                        format!("Failed to read symlink target: {error}"),
                    )
                })?
                .to_string_lossy()
                .into_owned(),
        )
    } else {
        None
    };

    let modified_at = format_timestamp(metadata.modified().map_err(|error| {
        CommandError::new(
            ErrorCode::IoError,
            format!("Failed to read modified time: {error}"),
        )
    })?)
    .ok_or_else(|| CommandError::new(ErrorCode::IoError, "Failed to format modified timestamp"))?;

    let created_at = metadata.created().ok().and_then(format_timestamp);

    Ok(StatPathResult {
        path,
        kind: kind.to_string(),
        size_bytes: if metadata.is_dir() { 0 } else { metadata.len() },
        modified_at,
        created_at,
        readonly: metadata.permissions().readonly(),
        mode: unix_mode(&metadata),
        executable: is_executable(&resolved, &metadata),
        symlink_target,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    #[test]
    fn stats_file() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("note.txt"), "hello").expect("write file");

        let result =
            stat_path("note.txt".to_string(), root.to_string_lossy().to_string()).expect("stat");

        assert_eq!(result.kind, "file");
        assert_eq!(result.size_bytes, 5);
        assert!(!result.modified_at.is_empty());
        assert!(!result.executable);
        assert!(result.symlink_target.is_none());
        #[cfg(unix)]
        assert!(result.mode.is_some());
        #[cfg(windows)]
        assert!(result.mode.is_none());
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn stats_directory() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir(root.join("dir")).expect("create dir");

        let result =
            stat_path("dir".to_string(), root.to_string_lossy().to_string()).expect("stat");

        assert_eq!(result.kind, "directory");
        assert_eq!(result.size_bytes, 0);
        assert!(!result.executable);
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn stats_executable_extension_on_windows_or_unix_bit() {
        let (root, cleanup) = temp_workspace();

        #[cfg(windows)]
        {
            fs::write(root.join("tool.exe"), "mz").expect("write exe");
            let result = stat_path("tool.exe".to_string(), root.to_string_lossy().to_string())
                .expect("stat");
            assert!(result.executable);
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::write(root.join("tool"), "#!/bin/sh\n").expect("write tool");
            let mut perms = fs::metadata(root.join("tool"))
                .expect("metadata")
                .permissions();
            perms.set_mode(0o755);
            fs::set_permissions(root.join("tool"), perms).expect("chmod");
            let result =
                stat_path("tool".to_string(), root.to_string_lossy().to_string()).expect("stat");
            assert!(result.executable);
            assert_eq!(result.mode.as_deref(), Some("0755"));
        }

        cleanup_workspace(&cleanup);
    }

    #[test]
    fn stats_symlink() {
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
            stat_path("link.txt".to_string(), root.to_string_lossy().to_string()).expect("stat");

        assert_eq!(result.kind, "symlink");
        assert_eq!(result.symlink_target.as_deref(), Some("target.txt"));
        assert!(!result.executable);
        cleanup_workspace(&cleanup);
    }
}
