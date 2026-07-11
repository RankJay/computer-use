use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

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
            "invalid_pid",
            "Process id must not be zero",
        ));
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
                    "process_info_failed",
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
                    "process_not_found",
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
        CommandError::new("process_not_found", format!("Process {pid} was not found"))
    })?;
    // comm may contain spaces/parens; fields after the last ')' are numbered from 1 as utime=14
    let after_comm = stat
        .rsplit_once(')')
        .map(|(_, rest)| rest.trim_start())
        .ok_or_else(|| {
            CommandError::new("process_info_failed", "Unexpected /proc/pid/stat format")
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
                "process_info_failed",
                "Failed to parse utime from /proc/pid/stat",
            )
        })?;
    let stime = fields
        .next()
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or_else(|| {
            CommandError::new(
                "process_info_failed",
                "Failed to parse stime from /proc/pid/stat",
            )
        })?;
    Ok(utime.saturating_add(stime))
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
fn macos_cpu_seconds(pid: u32) -> Result<f64, CommandError> {
    use std::ffi::c_void;
    use std::mem::{size_of, MaybeUninit};

    #[repr(C)]
    struct ProcTaskInfo {
        pti_virtual_size: u64,
        pti_resident_size: u64,
        pti_total_user: u64,
        pti_total_system: u64,
        pti_threads_user: u64,
        pti_threads_system: u64,
        pti_policy: i32,
        pti_faults: i32,
        pti_pageins: i32,
        pti_cow_faults: i32,
        pti_messages_sent: i32,
        pti_messages_received: i32,
        pti_syscalls_mach: i32,
        pti_syscalls_unix: i32,
        pti_csw: i32,
        pti_threadnum: i32,
        pti_numrunning: i32,
        pti_priority: i32,
    }

    #[repr(C)]
    struct MachTimebaseInfo {
        numer: u32,
        denom: u32,
    }

    extern "C" {
        fn proc_pidinfo(
            pid: i32,
            flavor: i32,
            arg: u64,
            buffer: *mut c_void,
            buffersize: i32,
        ) -> i32;
        fn mach_timebase_info(info: *mut MachTimebaseInfo) -> i32;
    }

    const PROC_PIDTASKINFO: i32 = 4;
    let mut info = MaybeUninit::<ProcTaskInfo>::uninit();
    let size = size_of::<ProcTaskInfo>() as i32;
    // SAFETY: buffer points to ProcTaskInfo of the given size.
    let written = unsafe {
        proc_pidinfo(
            pid as i32,
            PROC_PIDTASKINFO,
            0,
            info.as_mut_ptr().cast(),
            size,
        )
    };
    if written <= 0 {
        return Err(CommandError::new(
            "process_not_found",
            format!("Process {pid} was not found"),
        ));
    }
    // SAFETY: proc_pidinfo filled the struct when written > 0.
    let info = unsafe { info.assume_init() };

    let mut timebase = MachTimebaseInfo { numer: 1, denom: 1 };
    // SAFETY: mach_timebase_info writes into the provided struct.
    let _ = unsafe { mach_timebase_info(&mut timebase) };
    let ticks = info.pti_total_user.saturating_add(info.pti_total_system);
    let nanos = ticks as f64 * f64::from(timebase.numer) / f64::from(timebase.denom.max(1));
    Ok(nanos / 1_000_000_000.0)
}

#[cfg(target_os = "macos")]
fn process_info_macos(pid: u32) -> Result<ProcessInfoResult, CommandError> {
    use std::process::Command;

    let output = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm=,rss="])
        .output()
        .map_err(|error| {
            CommandError::new("process_info_failed", format!("Failed to run ps: {error}"))
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

    let first = macos_cpu_seconds(pid)?;
    let wall_start = Instant::now();
    thread::sleep(CPU_SAMPLE_INTERVAL);
    let second = macos_cpu_seconds(pid)?;
    let wall = wall_start.elapsed();

    Ok(ProcessInfoResult {
        pid,
        name,
        memory_bytes: rss_kb.saturating_mul(1024),
        cpu_percent: cpu_percent_from_deltas(second - first, wall),
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
