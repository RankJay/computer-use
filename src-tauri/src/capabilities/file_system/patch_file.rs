use std::fs;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::path_utils::{self, MAX_READ_BYTES};

use super::patch::{apply_unified_diff, PatchError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchFileResult {
    pub path: String,
    pub bytes_written: u64,
    pub hunks_applied: usize,
}

fn map_patch_error(error: PatchError) -> CommandError {
    match error {
        PatchError::InvalidDiff => CommandError::new(
            ErrorCode::PatchInvalidDiff,
            "Patch is not a valid unified diff",
        ),
        PatchError::MultiFileDiff => CommandError::new(
            ErrorCode::PatchInvalidDiff,
            "Patch must modify a single file",
        ),
        PatchError::TargetMismatch => CommandError::new(
            ErrorCode::PatchInvalidDiff,
            "Patch target does not match the requested path",
        ),
        PatchError::ApplyFailed => CommandError::new(
            ErrorCode::PatchApplyFailed,
            "Failed to apply patch to file contents",
        ),
    }
}

#[tauri::command]
pub fn patch_file(
    path: String,
    diff: String,
    workspace_root: String,
) -> Result<PatchFileResult, CommandError> {
    let resolved = path_utils::resolve_workspace_path(&workspace_root, &path)?;
    path_utils::ensure_io_target_within_root(&workspace_root, &resolved)?;

    if !path_utils::path_lexists(&resolved) {
        return Err(CommandError::new(
            ErrorCode::NotFound,
            "File does not exist",
        ));
    }

    if !resolved.is_file() {
        return Err(CommandError::new(ErrorCode::NotAFile, "Path is not a file"));
    }

    let original = fs::read_to_string(&resolved).map_err(|error| {
        path_utils::map_fs_io_error(error, ErrorCode::ReadFailed, "Failed to read file")
    })?;

    let (patched, hunks_applied) =
        apply_unified_diff(&original, &diff, &path).map_err(map_patch_error)?;

    let bytes_written = patched.len() as u64;
    if bytes_written > MAX_READ_BYTES {
        return Err(CommandError::new(
            ErrorCode::FileTooLarge,
            format!("Patched file exceeds {MAX_READ_BYTES} byte limit"),
        ));
    }

    fs::write(&resolved, patched).map_err(|error| {
        path_utils::map_fs_io_error(
            error,
            ErrorCode::WriteFailed,
            "Failed to write patched file",
        )
    })?;

    Ok(PatchFileResult {
        path,
        bytes_written,
        hunks_applied,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::capabilities::file_system::test_support::{cleanup_workspace, temp_workspace};

    const DIFF: &str = "\
--- a/note.txt
+++ b/note.txt
@@ -1 +1,2 @@
 hello
+world
";

    #[test]
    fn patches_file_end_to_end() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("note.txt"), "hello\n").expect("write file");

        let result = patch_file(
            "note.txt".to_string(),
            DIFF.to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect("patch file");

        assert_eq!(result.hunks_applied, 1);
        assert_eq!(
            fs::read_to_string(root.join("note.txt")).expect("read patched"),
            "hello\nworld\n"
        );
        cleanup_workspace(&cleanup);
    }

    #[test]
    fn leaves_file_unchanged_on_invalid_diff() {
        let (root, cleanup) = temp_workspace();
        fs::write(root.join("note.txt"), "hello\n").expect("write file");

        let error = patch_file(
            "note.txt".to_string(),
            "not a diff".to_string(),
            root.to_string_lossy().to_string(),
        )
        .expect_err("invalid diff");

        assert_eq!(error.code, "patch_invalid_diff");
        assert_eq!(
            fs::read_to_string(root.join("note.txt")).expect("read unchanged"),
            "hello\n"
        );
        cleanup_workspace(&cleanup);
    }
}
