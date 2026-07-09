use std::path::Path;

use crate::capabilities::path_utils::CommandError;

pub fn resolve_cwd(cwd: Option<&str>) -> Result<Option<std::path::PathBuf>, CommandError> {
    let Some(raw) = cwd else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(CommandError::new(
            "invalid_cwd",
            "Working directory must be an absolute path",
        ));
    }

    if !path.is_dir() {
        return Err(CommandError::new(
            "invalid_cwd",
            "Working directory does not exist",
        ));
    }

    Ok(Some(path.to_path_buf()))
}
