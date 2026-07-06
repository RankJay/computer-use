use std::process::Command;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::path_utils::{self, CommandError};

const TEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Serialize)]
pub struct RunTestsResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub passed: bool,
}

#[tauri::command]
pub fn run_tests(suite: String, workspace_root: String) -> Result<RunTestsResult, CommandError> {
    let root = path_utils::resolve_root(&workspace_root)?;
    let suite = suite.trim();

    let mut command = Command::new("bun");
    command.arg("test").current_dir(&root);

    if !suite.is_empty() {
        command.arg(suite);
    } else {
        command.arg("src");
    }

    let started = Instant::now();
    let output = command.output().map_err(|error| {
        CommandError::new(
            "spawn_failed",
            format!("Failed to run tests (is bun installed?): {error}"),
        )
    })?;

    if started.elapsed() > TEST_TIMEOUT {
        return Err(CommandError::new(
            "timeout",
            "Test command exceeded the 60 second limit",
        ));
    }

    let exit_code = output.status.code().unwrap_or(-1);

    Ok(RunTestsResult {
        exit_code,
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        passed: output.status.success(),
    })
}
