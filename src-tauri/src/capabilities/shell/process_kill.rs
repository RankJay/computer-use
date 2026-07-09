use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

use super::process_list::process_list;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKillResult {
    pub pid: u32,
    pub name: Option<String>,
}

#[tauri::command]
pub fn process_kill(pid: Option<u32>, name: Option<String>) -> Result<ProcessKillResult, CommandError> {
    let has_pid = pid.is_some();
    let has_name = name
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());

    if has_pid == has_name {
        return Err(CommandError::new(
            "invalid_input",
            "Provide exactly one of pid or name",
        ));
    }

    let target_pid = if let Some(pid) = pid {
        if pid == 0 {
            return Err(CommandError::new("invalid_pid", "Process id must not be zero"));
        }
        pid
    } else {
        resolve_pid_by_name(name.as_ref().expect("name checked above"))?
    };

    #[cfg(target_os = "windows")]
    {
        return kill_process_windows(target_pid);
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        return kill_process_unix(target_pid);
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(CommandError::new(
            "unsupported_platform",
            "Process termination is not supported on this platform",
        ))
    }
}

fn resolve_pid_by_name(name: &str) -> Result<u32, CommandError> {
    let needle = name.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return Err(CommandError::new("invalid_name", "Process name must not be empty"));
    }

    let listed = process_list()?;
    let matches: Vec<(u32, String)> = listed
        .text
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let pid = parts.next()?.parse::<u32>().ok()?;
            let process_name = parts.next()?.to_string();
            if process_name.to_ascii_lowercase() == needle
                || process_name.to_ascii_lowercase().ends_with(&format!(".{needle}"))
            {
                Some((pid, process_name))
            } else {
                None
            }
        })
        .collect();

    match matches.len() {
        0 => Err(CommandError::new(
            "process_not_found",
            format!("No running process matched name '{name}'"),
        )),
        1 => Ok(matches[0].0),
        _ => Err(CommandError::new(
            "ambiguous_process_name",
            format!("Multiple processes matched name '{name}'"),
        )
        .with_details(
            matches
                .into_iter()
                .map(|(pid, process_name)| format!("{pid} {process_name}"))
                .collect::<Vec<_>>()
                .join("\n"),
        )),
    }
}

#[cfg(target_os = "windows")]
fn kill_process_windows(pid: u32) -> Result<ProcessKillResult, CommandError> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };

    unsafe {
        let process = OpenProcess(PROCESS_TERMINATE, false, pid).map_err(|error| {
            CommandError::new(
                "process_not_found",
                format!("Could not open process {pid}: {error}"),
            )
        })?;
        TerminateProcess(process, 1).map_err(|error| {
            CommandError::new(
                "kill_failed",
                format!("Failed to terminate process {pid}: {error}"),
            )
        })?;
        let _ = CloseHandle(process);
    }

    Ok(ProcessKillResult { pid, name: None })
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn kill_process_unix(pid: u32) -> Result<ProcessKillResult, CommandError> {
    use std::process::Command;

    let status = Command::new("kill")
        .arg(pid.to_string())
        .status()
        .map_err(|error| {
            CommandError::new("kill_failed", format!("Failed to run kill: {error}"))
        })?;

    if !status.success() {
        return Err(CommandError::new(
            "kill_failed",
            format!("kill command failed for pid {pid}"),
        ));
    }

    Ok(ProcessKillResult { pid, name: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_selector() {
        let error = process_kill(None, None).expect_err("missing selector");
        assert_eq!(error.code, "invalid_input");
    }

    #[test]
    fn rejects_both_selectors() {
        let error = process_kill(Some(1), Some("notepad".to_string())).expect_err("both selectors");
        assert_eq!(error.code, "invalid_input");
    }
}
