use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

use super::common::resolve_cwd;

const SHELL_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_CAPTURE_BYTES: usize = 512_000;

#[derive(Debug, Serialize)]
pub struct RunShellResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub cwd: Option<String>,
}

fn truncate_output(value: String) -> String {
    if value.len() <= MAX_CAPTURE_BYTES {
        return value;
    }

    format!(
        "{}…\n[output truncated at {MAX_CAPTURE_BYTES} bytes]",
        &value[..MAX_CAPTURE_BYTES]
    )
}

fn read_stream(
    stream: Option<std::process::ChildStdout>,
) -> thread::JoinHandle<Result<String, CommandError>> {
    thread::spawn(move || {
        let Some(mut reader) = stream else {
            return Ok(String::new());
        };

        let mut buffer = String::new();
        reader
            .read_to_string(&mut buffer)
            .map_err(|error| CommandError::new("read_output_failed", format!("{error}")))?;
        Ok(buffer)
    })
}

fn read_stderr_stream(
    stream: Option<std::process::ChildStderr>,
) -> thread::JoinHandle<Result<String, CommandError>> {
    thread::spawn(move || {
        let Some(mut reader) = stream else {
            return Ok(String::new());
        };

        let mut buffer = String::new();
        reader
            .read_to_string(&mut buffer)
            .map_err(|error| CommandError::new("read_output_failed", format!("{error}")))?;
        Ok(buffer)
    })
}

#[tauri::command]
pub fn run_shell(
    program: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<RunShellResult, CommandError> {
    let program = program.trim();
    if program.is_empty() {
        return Err(CommandError::new(
            "invalid_program",
            "Program must not be empty",
        ));
    }

    let working_dir = resolve_cwd(cwd.as_deref())?;

    let mut command = Command::new(program);
    command
        .args(args.unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = &working_dir {
        command.current_dir(dir);
    }

    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            command.env(key, value);
        }
    }

    let started = Instant::now();
    let mut child = command.spawn().map_err(|error| {
        CommandError::new(
            "spawn_failed",
            format!("Failed to start process: {error}"),
        )
    })?;

    let stdout_handle = read_stream(child.stdout.take());
    let stderr_handle = read_stderr_stream(child.stderr.take());

    let timed_out;
    loop {
        match child
            .try_wait()
            .map_err(|error| CommandError::new("wait_failed", format!("Failed to wait: {error}")))?
        {
            Some(status) => {
                let stdout = stdout_handle
                    .join()
                    .map_err(|_| CommandError::new("read_output_failed", "stdout reader panicked"))??;
                let stderr = stderr_handle
                    .join()
                    .map_err(|_| CommandError::new("read_output_failed", "stderr reader panicked"))??;

                return Ok(RunShellResult {
                    exit_code: status.code().unwrap_or(-1),
                    stdout: truncate_output(stdout),
                    stderr: truncate_output(stderr),
                    timed_out: false,
                    cwd: working_dir.map(|path| path.to_string_lossy().into_owned()),
                });
            }
            None if started.elapsed() >= SHELL_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                timed_out = true;
                break;
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    }

    let stdout = stdout_handle
        .join()
        .map_err(|_| CommandError::new("read_output_failed", "stdout reader panicked"))?
        .unwrap_or_default();
    let stderr = stderr_handle
        .join()
        .map_err(|_| CommandError::new("read_output_failed", "stderr reader panicked"))?
        .unwrap_or_default();

    Ok(RunShellResult {
        exit_code: -1,
        stdout: truncate_output(stdout),
        stderr: if stderr.is_empty() {
            "Command timed out after 120 seconds".to_string()
        } else {
            truncate_output(stderr)
        },
        timed_out,
        cwd: working_dir.map(|path| path.to_string_lossy().into_owned()),
    })
}
