use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};

const CPU_SAMPLE_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfoResult {
    pub pid: u32,
    pub name: String,
    pub memory_bytes: u64,
    pub cpu_percent: Option<f64>,
}

fn cpu_count() -> f64 {
    std::thread::available_parallelism()
        .map(|n| n.get() as f64)
        .unwrap_or(1.0)
        .max(1.0)
}

fn cpu_percent_from_deltas(cpu_seconds: f64, wall: Duration) -> Option<f64> {
    let wall_secs = wall.as_secs_f64();
    if wall_secs <= 0.0 || cpu_seconds < 0.0 {
        return None;
    }
    let percent = 100.0 * cpu_seconds / (wall_secs * cpu_count());
    Some(percent.clamp(0.0, 100.0 * cpu_count()))
}

#[tauri::command]
pub fn process_info(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    if pid == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidPid,
            "Process id must not be zero",
        ));
    }

    #[cfg(target_os = "windows")]
    {
        process_info_windows(pid)
    }

    #[cfg(target_os = "linux")]
    {
        process_info_linux(pid)
    }

    #[cfg(target_os = "macos")]
    {
        process_info_macos(pid)
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        Err(CommandError::new(
            ErrorCode::UnsupportedPlatform,
            "Process info is not supported on this platform",
        ))
    }
}

#[cfg(target_os = "windows")]
fn filetime_to_seconds(filetime: windows::Win32::Foundation::FILETIME) -> f64 {
    let ticks = (u64::from(filetime.dwHighDateTime) << 32) | u64::from(filetime.dwLowDateTime);
    // FILETIME is 100-nanosecond intervals
    ticks as f64 / 10_000_000.0
}

#[cfg(target_os = "windows")]
fn process_cpu_seconds(process: windows::Win32::Foundation::HANDLE) -> Result<f64, CommandError> {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Threading::GetProcessTimes;

    let mut creation = FILETIME::default();
    let mut exit = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();

    unsafe {
        GetProcessTimes(process, &mut creation, &mut exit, &mut kernel, &mut user).map_err(
            |error| {
                CommandError::new(
                    ErrorCode::ProcessInfoFailed,
                    format!("Failed to read process CPU times: {error}"),
                )
            },
        )?;
    }

    Ok(filetime_to_seconds(kernel) + filetime_to_seconds(user))
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
        let process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
            .map_err(|error| {
                CommandError::new(
                    ErrorCode::ProcessNotFound,
                    format!("Could not open process {pid}: {error}"),
                )
            })?;

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
                ErrorCode::ProcessInfoFailed,
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
                ErrorCode::ProcessInfoFailed,
                format!("Failed to read process memory: {error}"),
            )
        })?;

        let first_cpu = process_cpu_seconds(process)?;
        let wall_start = Instant::now();
        thread::sleep(CPU_SAMPLE_INTERVAL);
        let second_cpu = process_cpu_seconds(process)?;
        let wall = wall_start.elapsed();
        let _ = CloseHandle(process);

        Ok(ProcessInfoResult {
            pid,
            name,
            memory_bytes: counters.WorkingSetSize as u64,
            cpu_percent: cpu_percent_from_deltas(second_cpu - first_cpu, wall),
        })
    }
}

#[cfg(target_os = "linux")]
fn linux_clk_tck() -> f64 {
    // USER_HZ is 100 on virtually all Linux configs used for desktop agents.
    100.0
}

#[cfg(target_os = "linux")]
fn linux_cpu_jiffies(pid: u32) -> Result<u64, CommandError> {
    use std::fs;

    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).map_err(|_| {
        CommandError::new(
            ErrorCode::ProcessNotFound,
            format!("Process {pid} was not found"),
        )
    })?;
    // comm may contain spaces/parens; fields after the last ')' are numbered from 1 as utime=14
    let after_comm = stat
        .rsplit_once(')')
        .map(|(_, rest)| rest.trim_start())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ProcessInfoFailed,
                "Unexpected /proc/pid/stat format",
            )
        })?;
    let mut fields = after_comm.split_whitespace();
    // After ')': state(1) ... utime is field 14 of full stat = index 11 after state?
    // Full: pid (comm) state ppid ... utime(14) stime(15)
    // After ') ': field[0]=state, [1]=ppid, ... [11]=utime, [12]=stime
    let utime = fields
        .nth(11)
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ProcessInfoFailed,
                "Failed to parse utime from /proc/pid/stat",
            )
        })?;
    let stime = fields
        .next()
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ProcessInfoFailed,
                "Failed to parse stime from /proc/pid/stat",
            )
        })?;
    Ok(utime.saturating_add(stime))
}

#[cfg(target_os = "linux")]
fn process_info_linux(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    use std::fs;

    let comm = fs::read_to_string(format!("/proc/{pid}/comm")).map_err(|_| {
        CommandError::new(
            ErrorCode::ProcessNotFound,
            format!("Process {pid} was not found"),
        )
    })?;
    let statm = fs::read_to_string(format!("/proc/{pid}/statm")).map_err(|_| {
        CommandError::new(
            ErrorCode::ProcessNotFound,
            format!("Process {pid} was not found"),
        )
    })?;
    let pages = statm
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let page_size = 4096u64;

    let first = linux_cpu_jiffies(pid)?;
    let wall_start = Instant::now();
    thread::sleep(CPU_SAMPLE_INTERVAL);
    let second = linux_cpu_jiffies(pid)?;
    let wall = wall_start.elapsed();
    let delta_secs = (second.saturating_sub(first)) as f64 / linux_clk_tck();

    Ok(ProcessInfoResult {
        pid,
        name: comm.trim().to_string(),
        memory_bytes: pages.saturating_mul(page_size),
        cpu_percent: cpu_percent_from_deltas(delta_secs, wall),
    })
}

#[cfg(target_os = "macos")]
struct MacosTaskSnapshot {
    resident_size: u64,
    cpu_seconds: f64,
}

#[cfg(target_os = "macos")]
fn macos_map_proc_error(pid: u32) -> CommandError {
    let err = std::io::Error::last_os_error();
    match err.raw_os_error() {
        Some(libc::EPERM) => CommandError::new(
            ErrorCode::OsPermissionDenied,
            format!("Not permitted to inspect process {pid}"),
        ),
        _ => CommandError::new(
            ErrorCode::ProcessNotFound,
            format!("Process {pid} was not found"),
        ),
    }
}

#[cfg(target_os = "macos")]
fn macos_task_snapshot(pid: u32) -> Result<MacosTaskSnapshot, CommandError> {
    use std::mem::{size_of, MaybeUninit};

    let mut info = MaybeUninit::<libc::proc_taskinfo>::uninit();
    let size = size_of::<libc::proc_taskinfo>() as i32;
    // SAFETY: buffer points to proc_taskinfo of the given size.
    let written = unsafe {
        libc::proc_pidinfo(
            pid as i32,
            libc::PROC_PIDTASKINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written <= 0 {
        return Err(macos_map_proc_error(pid));
    }
    // SAFETY: proc_pidinfo filled the struct when written > 0.
    let info = unsafe { info.assume_init() };

    let mut timebase = mach2::mach_time::mach_timebase_info { numer: 1, denom: 1 };
    // SAFETY: mach_timebase_info writes into the provided struct.
    let _ = unsafe { mach2::mach_time::mach_timebase_info(&mut timebase) };
    let ticks = info.pti_total_user.saturating_add(info.pti_total_system);
    let nanos = ticks as f64 * f64::from(timebase.numer) / f64::from(timebase.denom.max(1));

    Ok(MacosTaskSnapshot {
        resident_size: info.pti_resident_size,
        cpu_seconds: nanos / 1_000_000_000.0,
    })
}

#[cfg(target_os = "macos")]
fn macos_process_name(pid: u32) -> Result<String, CommandError> {
    use std::path::Path;

    let mut buffer = [0i8; 4096];
    // SAFETY: buffer is a writable C string buffer of known size.
    let written =
        unsafe { libc::proc_pidpath(pid as i32, buffer.as_mut_ptr().cast(), buffer.len() as u32) };
    if written <= 0 {
        return Err(macos_map_proc_error(pid));
    }

    // SAFETY: proc_pidpath null-terminates on success.
    let path = unsafe { std::ffi::CStr::from_ptr(buffer.as_ptr()) }
        .to_string_lossy()
        .into_owned();

    Ok(Path::new(&path)
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or(path))
}

#[cfg(target_os = "macos")]
fn process_info_macos(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    let name = macos_process_name(pid)?;
    let first = macos_task_snapshot(pid)?;
    let wall_start = Instant::now();
    thread::sleep(CPU_SAMPLE_INTERVAL);
    let second = macos_task_snapshot(pid)?;
    let wall = wall_start.elapsed();

    Ok(ProcessInfoResult {
        pid,
        name,
        memory_bytes: second.resident_size,
        cpu_percent: cpu_percent_from_deltas(second.cpu_seconds - first.cpu_seconds, wall),
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

    #[test]
    fn reports_cpu_for_current_process() {
        let result = process_info(std::process::id()).expect("current process info");
        assert_eq!(result.pid, std::process::id());
        assert!(result.memory_bytes > 0);
        assert!(
            result.cpu_percent.is_some(),
            "expected cpu_percent sample for current process"
        );
    }
}
