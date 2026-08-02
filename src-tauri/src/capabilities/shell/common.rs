use std::path::Path;
use std::process::Command;

use crate::capabilities::error::{CommandError, ErrorCode};

/// Prevent a console window from flashing for capture/probe child processes on Windows.
pub fn suppress_console_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

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
            ErrorCode::InvalidCwd,
            "Working directory must be an absolute path",
        ));
    }

    if !path.is_dir() {
        return Err(CommandError::new(
            ErrorCode::InvalidCwd,
            "Working directory does not exist",
        ));
    }

    Ok(Some(path.to_path_buf()))
}
