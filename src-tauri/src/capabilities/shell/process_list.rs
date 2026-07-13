use std::path::Path;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};

const MAX_PROCESSES: usize = 200;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessListResult {
    pub text: String,
    pub count: usize,
}

/// Parse a `"{pid}  {name}"` line where `name` may contain spaces.
pub(crate) fn parse_process_list_line(line: &str) -> Option<(u32, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let (pid_str, name) = trimmed.split_once(char::is_whitespace)?;
    let pid = pid_str.trim().parse().ok()?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some((pid, name.to_string()))
}

/// Match kill-by-name against a listed process (full path, basename, or `.ext` suffix).
pub(crate) fn process_name_matches(process_name: &str, needle: &str) -> bool {
    let lower = process_name.to_ascii_lowercase();
    if lower == needle || lower.ends_with(&format!(".{needle}")) {
        return true;
    }
    Path::new(process_name)
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|base| base.to_ascii_lowercase() == needle)
}

#[tauri::command]
pub fn process_list() -> Result<ProcessListResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        list_processes_windows()
    }

    #[cfg(target_os = "linux")]
    {
        list_processes_linux()
    }

    #[cfg(target_os = "macos")]
    {
        list_processes_macos()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(CommandError::new(
            ErrorCode::UnsupportedPlatform,
            "Process listing is not supported on this platform",
        ))
    }
}

#[cfg(target_os = "windows")]
fn list_processes_windows() -> Result<ProcessListResult, CommandError> {
    use std::path::Path;

    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).map_err(|error| {
            CommandError::new(
                ErrorCode::ProcessEnumFailed,
                format!("Failed to snapshot processes: {error}"),
            )
        })?;

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut lines = Vec::new();
        let mut ok = Process32FirstW(snapshot, &mut entry);
        while ok.is_ok() {
            let exe = String::from_utf16_lossy(
                &entry
                    .szExeFile
                    .iter()
                    .take_while(|ch| **ch != 0)
                    .copied()
                    .collect::<Vec<_>>(),
            );
            let name = Path::new(&exe)
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or(exe);
            lines.push(format!("{}  {}", entry.th32ProcessID, name));
            if lines.len() >= MAX_PROCESSES {
                break;
            }
            ok = Process32NextW(snapshot, &mut entry);
        }

        let _ = CloseHandle(snapshot);
        let count = lines.len();
        Ok(ProcessListResult {
            text: lines.join("\n"),
            count,
        })
    }
}

#[cfg(target_os = "linux")]
fn list_processes_linux() -> Result<ProcessListResult, CommandError> {
    use std::fs;

    let mut entries: Vec<(u32, String)> = fs::read_dir("/proc")
        .map_err(|error| {
            CommandError::new(
                ErrorCode::ProcessEnumFailed,
                format!("Failed to read /proc: {error}"),
            )
        })?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let pid = file_name.parse::<u32>().ok()?;
            let comm = fs::read_to_string(entry.path().join("comm"))
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())?;
            Some((pid, comm))
        })
        .collect();

    entries.sort_by_key(|(pid, _)| *pid);
    entries.truncate(MAX_PROCESSES);

    let count = entries.len();
    Ok(ProcessListResult {
        text: entries
            .into_iter()
            .map(|(pid, name)| format!("{pid}  {name}"))
            .collect::<Vec<_>>()
            .join("\n"),
        count,
    })
}

#[cfg(target_os = "macos")]
fn list_processes_macos() -> Result<ProcessListResult, CommandError> {
    use std::process::Command;

    let output = Command::new("ps")
        .args(["-ax", "-o", "pid=,comm="])
        .output()
        .map_err(|error| {
            CommandError::new(
                ErrorCode::ProcessEnumFailed,
                format!("Failed to run ps: {error}"),
            )
        })?;

    if !output.status.success() {
        return Err(CommandError::new(
            ErrorCode::ProcessEnumFailed,
            "ps command failed",
        ));
    }

    let mut lines = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((pid, name)) = parse_process_list_line(line) else {
            continue;
        };
        lines.push(format!("{pid}  {name}"));
        if lines.len() >= MAX_PROCESSES {
            break;
        }
    }

    let count = lines.len();
    Ok(ProcessListResult {
        text: lines.join("\n"),
        count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_keeps_spaced_process_name() {
        let (pid, name) = parse_process_list_line(
            "1234  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        )
        .expect("parse");
        assert_eq!(pid, 1234);
        assert_eq!(
            name,
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        );
    }

    #[test]
    fn name_match_uses_basename() {
        let full = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        assert!(process_name_matches(full, "google chrome"));
        assert!(process_name_matches(
            full,
            full.to_ascii_lowercase().as_str()
        ));
        assert!(!process_name_matches(full, "chrome"));
    }
}
