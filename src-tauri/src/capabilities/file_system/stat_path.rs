use std::fs;
use std::time::SystemTime;

use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::capabilities::path_utils::{self, CommandError};

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
}

fn format_timestamp(time: SystemTime) -> Option<String> {
    let datetime: OffsetDateTime = time.try_into().ok()?;
    datetime.format(&Rfc3339).ok()
}

fn path_kind(metadata: &fs::Metadata) -> &'static str {
    if metadata.is_dir() {
        "directory"
    } else if metadata.is_symlink() {
        "symlink"
    } else {
        "file"
    }
}

#[tauri::command]
pub fn stat_path(path: String, workspace_root: String) -> Result<StatPathResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;

    if !resolved.exists() {
        return Err(CommandError::new("not_found", "Path does not exist"));
    }

    let metadata = fs::metadata(&resolved).map_err(|error| {
        CommandError::new("io_error", format!("Failed to read path metadata: {error}"))
    })?;

    let modified_at = format_timestamp(metadata.modified().map_err(|error| {
        CommandError::new("io_error", format!("Failed to read modified time: {error}"))
    })?)
    .ok_or_else(|| CommandError::new("io_error", "Failed to format modified timestamp"))?;

    let created_at = metadata
        .created()
        .ok()
        .and_then(format_timestamp);

    Ok(StatPathResult {
        path,
        kind: path_kind(&metadata).to_string(),
        size_bytes: if metadata.is_dir() { 0 } else { metadata.len() },
        modified_at,
        created_at,
        readonly: metadata.permissions().readonly(),
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
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn stats_directory() {
        let (root, cleanup) = temp_workspace();
        fs::create_dir(root.join("dir")).expect("create dir");

        let result = stat_path("dir".to_string(), root.to_string_lossy().to_string()).expect("stat");

        assert_eq!(result.kind, "directory");
        assert_eq!(result.size_bytes, 0);
        cleanup_workspace(&cleanup);
    }
}
