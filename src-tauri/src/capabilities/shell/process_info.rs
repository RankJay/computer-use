use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfoResult {
    pub pid: u32,
    pub name: String,
    pub memory_bytes: u64,
    pub cpu_percent: Option<f64>,
}

#[tauri::command]
pub fn process_info(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    if pid == 0 {
        return Err(CommandError::new("invalid_pid", "Process id must not be zero"));
    }

    #[cfg(target_os = "windows")]
    {
        return process_info_windows(pid);
    }

    #[cfg(target_os = "linux")]
    {
        return process_info_linux(pid);
    }

    #[cfg(target_os = "macos")]
    {
        return process_info_macos(pid);
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(CommandError::new(
            "unsupported_platform",
            "Process info is not supported on this platform",
        ))
    }
}

#[cfg(target_os = "windows")]
fn process_info_windows(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    use std::mem::size_of;
    use std::path::Path;

    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_INFORMATION,
        PROCESS_VM_READ,
    };

    unsafe {
        let process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).map_err(
            |error| {
                CommandError::new(
                    "process_not_found",
                    format!("Could not open process {pid}: {error}"),
                )
            },
        )?;

        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
        .map_err(|error| {
            CommandError::new(
                "process_info_failed",
                format!("Failed to read process name: {error}"),
            )
        })?;
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        let name = Path::new(&path)
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| format!("pid:{pid}"));

        let mut counters = PROCESS_MEMORY_COUNTERS::default();
        GetProcessMemoryInfo(
            process,
            &mut counters,
            size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
        .map_err(|error| {
            CommandError::new(
                "process_info_failed",
                format!("Failed to read process memory: {error}"),
            )
        })?;
        let _ = CloseHandle(process);

        Ok(ProcessInfoResult {
            pid,
            name,
            memory_bytes: counters.WorkingSetSize as u64,
            cpu_percent: None,
        })
    }
}

#[cfg(target_os = "linux")]
fn process_info_linux(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    use std::fs;

    let comm = fs::read_to_string(format!("/proc/{pid}/comm")).map_err(|_| {
        CommandError::new("process_not_found", format!("Process {pid} was not found"))
    })?;
    let statm = fs::read_to_string(format!("/proc/{pid}/statm")).map_err(|_| {
        CommandError::new("process_not_found", format!("Process {pid} was not found"))
    })?;
    let pages = statm
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let page_size = 4096u64;

    Ok(ProcessInfoResult {
        pid,
        name: comm.trim().to_string(),
        memory_bytes: pages.saturating_mul(page_size),
        cpu_percent: None,
    })
}

#[cfg(target_os = "macos")]
fn process_info_macos(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    use std::process::Command;

    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm=,rss="])
        .output()
        .map_err(|error| {
            CommandError::new(
                "process_info_failed",
                format!("Failed to run ps: {error}"),
            )
        })?;

    if !output.status.success() {
        return Err(CommandError::new(
            "process_not_found",
            format!("Process {pid} was not found"),
        ));
    }

    let line = String::from_utf8_lossy(&output.stdout);
    let mut parts = line.split_whitespace();
    let name = parts
        .next()
        .ok_or_else(|| CommandError::new("process_info_failed", "Unexpected ps output"))?
        .to_string();
    let rss_kb = parts
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(ProcessInfoResult {
        pid,
        name,
        memory_bytes: rss_kb.saturating_mul(1024),
        cpu_percent: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_zero_pid() {
        let error = process_info(0).expect_err("zero pid should fail");
        assert_eq!(error.code, "invalid_pid");
    }
}
