use crate::command_output::CommandOutput;
use serde::Deserialize;
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use wait_timeout::ChildExt;

const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_MAX_STREAM_BYTES: usize = 512 * 1024;

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
    let slice = if buf.len() > max {
        &buf[..max]
    } else {
        &buf
    };
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
) -> Result<CommandOutput, String> {
    if program.trim().is_empty() {
        return Err("program must not be empty".into());
    }

    let timeout_ms = timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let max_each = max_output_bytes.unwrap_or(DEFAULT_MAX_STREAM_BYTES);

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

    let stdout = child.stdout.take().ok_or_else(|| "missing stdout pipe".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "missing stderr pipe".to_string())?;

    let max_out = max_each;
    let max_err = max_each;
    let th_out = thread::spawn(move || read_limited(&mut std::io::BufReader::new(stdout), max_out));
    let th_err = thread::spawn(move || read_limited(&mut std::io::BufReader::new(stderr), max_err));

    let timeout = Duration::from_millis(timeout_ms);
    let status = match child.wait_timeout(timeout).map_err(|e| e.to_string())? {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "command timed out after {} ms: {} {:?}",
                timeout_ms, program, args
            ));
        }
    };

    let stdout_done = th_out.join().map_err(|_| "stdout reader panicked".to_string())?;
    let stderr_done = th_err.join().map_err(|_| "stderr reader panicked".to_string())?;
    let stdout = stdout_done.map_err(|e| e.to_string())?;
    let stderr = stderr_done.map_err(|e| e.to_string())?;

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
}

#[tauri::command]
pub fn run_command(request: RunCommandInvoke) -> Result<CommandOutput, String> {
    run_command_bounded(
        request.program,
        request.args,
        request.cwd,
        request.timeout_ms,
        request.max_output_bytes,
    )
}