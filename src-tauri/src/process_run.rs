use crate::command_output::CommandOutput;
use serde::Deserialize;
use std::collections::HashSet;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_MAX_STREAM_BYTES: usize = 512 * 1024;

fn cancelled_command_tokens() -> &'static Mutex<HashSet<u32>> {
    static TOKENS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    TOKENS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn clear_cancel_token(cancel_token: Option<u32>) {
    let Some(token) = cancel_token else {
        return;
    };
    if let Ok(mut tokens) = cancelled_command_tokens().lock() {
        tokens.remove(&token);
    }
}

fn cancel_requested(cancel_token: Option<u32>) -> bool {
    let Some(token) = cancel_token else {
        return false;
    };
    cancelled_command_tokens()
        .lock()
        .map(|tokens| tokens.contains(&token))
        .unwrap_or(false)
}

fn read_limited<R: Read>(r: &mut R, max: usize) -> std::io::Result<String> {
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let n = r.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        let take = (max + 1).saturating_sub(buf.len()).min(n);
        buf.extend_from_slice(&chunk[..take]);
        if buf.len() > max {
            break;
        }
    }
    let truncated = buf.len() > max;
    let slice = if buf.len() > max { &buf[..max] } else { &buf };
    let mut s = String::from_utf8_lossy(slice).into_owned();
    if truncated {
        s.push_str("\n… [output truncated]");
    }
    Ok(s)
}

pub fn run_command_bounded(
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    max_output_bytes: Option<usize>,
    cancel_token: Option<u32>,
) -> Result<CommandOutput, String> {
    if program.trim().is_empty() {
        return Err("program must not be empty".into());
    }

    let timeout_ms = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let max_each = max_output_bytes.unwrap_or(DEFAULT_MAX_STREAM_BYTES);
    clear_cancel_token(cancel_token);

    let mut cmd = Command::new(&program);
    cmd.args(&args);
    if let Some(ref path) = cwd {
        if !path.trim().is_empty() {
            cmd.current_dir(path);
        }
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "missing stdout pipe".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "missing stderr pipe".to_string())?;

    let max_out = max_each;
    let max_err = max_each;
    let th_out = thread::spawn(move || read_limited(&mut std::io::BufReader::new(stdout), max_out));
    let th_err = thread::spawn(move || read_limited(&mut std::io::BufReader::new(stderr), max_err));

    let timeout = Duration::from_millis(timeout_ms);
    let deadline = Instant::now() + timeout;
    let wait_result = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break Ok(status);
        }
        if cancel_requested(cancel_token) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(format!("command cancelled: {} {:?}", program, args));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break Err(format!(
                "command timed out after {} ms: {} {:?}",
                timeout_ms, program, args
            ));
        }
        thread::sleep(Duration::from_millis(25));
    };
    clear_cancel_token(cancel_token);

    let stdout_done = th_out
        .join()
        .map_err(|_| "stdout reader panicked".to_string())?;
    let stderr_done = th_err
        .join()
        .map_err(|_| "stderr reader panicked".to_string())?;
    let stdout = stdout_done.map_err(|e| e.to_string())?;
    let stderr = stderr_done.map_err(|e| e.to_string())?;
    let status = wait_result?;

    Ok(CommandOutput {
        code: status.code(),
        stdout,
        stderr,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCommandInvoke {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
    pub max_output_bytes: Option<usize>,
    pub cancel_token: Option<u32>,
}

#[tauri::command]
pub async fn run_command(request: RunCommandInvoke) -> Result<CommandOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_command_bounded(
            request.program,
            request.args,
            request.cwd,
            request.timeout_ms,
            request.max_output_bytes,
            request.cancel_token,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_run_command(cancel_token: u32) -> Result<(), String> {
    cancelled_command_tokens()
        .lock()
        .map_err(|_| "command cancel registry lock poisoned".to_string())?
        .insert(cancel_token);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{cancel_run_command, read_limited, run_command_bounded};
    use std::io::Cursor;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn read_limited_marks_truncated_output() {
        let mut input = Cursor::new(b"abcdef".to_vec());
        let output = read_limited(&mut input, 3).expect("read should succeed");

        assert_eq!(output, "abc\n… [output truncated]");
    }

    #[test]
    fn run_command_bounded_rejects_empty_program() {
        let result = run_command_bounded("  ".to_string(), Vec::new(), None, None, None, None);

        assert!(result.is_err());
    }

    #[test]
    fn run_command_bounded_truncates_stdout_in_command_output() {
        let output = run_command_bounded(
            "rustc".to_string(),
            vec!["--version".to_string()],
            None,
            Some(10_000),
            Some(4),
            None,
        )
        .expect("rustc --version should run");

        assert_eq!(output.code, Some(0));
        assert!(output.stdout.starts_with("rust"));
        assert!(output.stdout.ends_with("\n… [output truncated]"));
    }

    #[cfg(target_os = "windows")]
    fn sleep_command() -> (String, Vec<String>) {
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "Start-Sleep -Milliseconds 200".to_string(),
            ],
        )
    }

    #[cfg(target_os = "windows")]
    fn long_sleep_command() -> (String, Vec<String>) {
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "Start-Sleep -Seconds 5".to_string(),
            ],
        )
    }

    #[cfg(not(target_os = "windows"))]
    fn long_sleep_command() -> (String, Vec<String>) {
        (
            "sh".to_string(),
            vec!["-c".to_string(), "sleep 5".to_string()],
        )
    }

    #[cfg(not(target_os = "windows"))]
    fn sleep_command() -> (String, Vec<String>) {
        (
            "sh".to_string(),
            vec!["-c".to_string(), "sleep 0.2".to_string()],
        )
    }

    #[test]
    fn run_command_bounded_times_out_long_running_process() {
        let (program, args) = sleep_command();
        let result = run_command_bounded(program, args, None, Some(1), Some(1024), None);

        let err = result.expect_err("sleep command should time out");
        assert!(err.contains("command timed out after 1 ms"));
    }

    #[test]
    fn run_command_bounded_honors_cancel_token() {
        let (program, args) = long_sleep_command();
        let cancel_token = 38;

        thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            cancel_run_command(cancel_token).expect("cancel token should be recorded");
        });

        let result = run_command_bounded(
            program,
            args,
            None,
            Some(10_000),
            Some(1024),
            Some(cancel_token),
        );

        let err = result.expect_err("sleep command should be cancelled");
        assert!(err.contains("command cancelled"));
    }
}
