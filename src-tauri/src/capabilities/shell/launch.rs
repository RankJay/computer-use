use std::collections::HashMap;
use std::process::Stdio;

use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

use super::common::resolve_cwd;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub pid: u32,
    pub exe: String,
}

#[tauri::command]
pub fn launch(
    exe: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<LaunchResult, CommandError> {
    let exe = exe.trim().to_string();
    if exe.is_empty() {
        return Err(CommandError::new(
            "invalid_exe",
            "Executable must not be empty",
        ));
    }

    let working_dir = resolve_cwd(cwd.as_deref())?;

    let mut command = std::process::Command::new(&exe);
    command
        .args(args.unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dir) = &working_dir {
        command.current_dir(dir);
    }

    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            command.env(key, value);
        }
    }

    let child = command.spawn().map_err(|error| {
        CommandError::new("spawn_failed", format!("Failed to launch process: {error}"))
    })?;

    Ok(LaunchResult {
        pid: child.id(),
        exe,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_exe() {
        let error = launch("  ".to_string(), None, None, None).expect_err("empty exe");
        assert_eq!(error.code, "invalid_exe");
    }
}
