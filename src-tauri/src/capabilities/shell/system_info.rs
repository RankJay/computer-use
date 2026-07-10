use std::env;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SystemInfoResult {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub hostname: Option<String>,
    pub username: Option<String>,
    pub cpu_count: usize,
    pub platform_detail: String,
}

fn read_hostname() -> Option<String> {
    env::var("COMPUTERNAME")
        .ok()
        .or_else(|| env::var("HOSTNAME").ok())
}

fn read_username() -> Option<String> {
    env::var("USERNAME")
        .ok()
        .or_else(|| env::var("USER").ok())
}

fn run_command_detail(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn platform_detail() -> String {
    #[cfg(target_os = "windows")]
    {
        return run_command_detail("cmd", &["/C", "ver"])
            .unwrap_or_else(|| "Windows".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        return run_command_detail("sw_vers", &[])
            .unwrap_or_else(|| "macOS".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if let Some(value) = line.strip_prefix("PRETTY_NAME=") {
                    return value.trim_matches('"').to_string();
                }
            }
        }

        return run_command_detail("uname", &["-sr"]).unwrap_or_else(|| "Linux".to_string());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        format!("{} {}", env::consts::OS, env::consts::ARCH)
    }
}

#[tauri::command]
pub fn get_system_info() -> SystemInfoResult {
    let cpu_count = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1);

    SystemInfoResult {
        os: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        family: env::consts::FAMILY.to_string(),
        hostname: read_hostname(),
        username: read_username(),
        cpu_count,
        platform_detail: platform_detail(),
    }
}
