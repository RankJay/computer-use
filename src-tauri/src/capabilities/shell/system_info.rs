use std::env;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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
    env::var("USERNAME").ok().or_else(|| env::var("USER").ok())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn run_command_detail(program: &str, args: &[&str]) -> Option<String> {
    use std::process::Command;

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
        windows_platform_detail()
    }

    #[cfg(target_os = "macos")]
    {
        run_command_detail("sw_vers", &[]).unwrap_or_else(|| "macOS".to_string())
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

        run_command_detail("uname", &["-sr"]).unwrap_or_else(|| "Linux".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        format!("{} {}", env::consts::OS, env::consts::ARCH)
    }
}

#[cfg(target_os = "windows")]
fn format_windows_platform_detail(
    product_name: Option<&str>,
    display_version: Option<&str>,
    current_build: Option<&str>,
) -> String {
    let product = product_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Windows");
    let display = display_version
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let build = current_build
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let mut detail = product.to_string();
    if let Some(version) = display {
        detail.push(' ');
        detail.push_str(version);
    }
    if let Some(build) = build {
        detail.push_str(" (build ");
        detail.push_str(build);
        detail.push(')');
    }
    detail
}

#[cfg(target_os = "windows")]
fn read_current_version_sz(value_name: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};

    let subkey: Vec<u16> = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let name: Vec<u16> = value_name.encode_utf16().chain(Some(0)).collect();

    let mut size = 0u32;
    let probe = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(subkey.as_ptr()),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut size),
        )
    };
    if probe != ERROR_SUCCESS || size == 0 {
        return None;
    }

    let mut buffer = vec![0u16; (size as usize / 2).max(1)];
    let mut buf_bytes = (buffer.len() * 2) as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(subkey.as_ptr()),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_SZ,
            None,
            Some(buffer.as_mut_ptr().cast()),
            Some(&mut buf_bytes),
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }

    let len = (buf_bytes as usize / 2).saturating_sub(1);
    let text = String::from_utf16_lossy(&buffer[..len.min(buffer.len())])
        .trim()
        .to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(target_os = "windows")]
fn windows_platform_detail() -> String {
    format_windows_platform_detail(
        read_current_version_sz("ProductName").as_deref(),
        read_current_version_sz("DisplayVersion").as_deref(),
        read_current_version_sz("CurrentBuild").as_deref(),
    )
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

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn formats_full_windows_platform_detail() {
        assert_eq!(
            format_windows_platform_detail(Some("Windows 11 Pro"), Some("24H2"), Some("26100"),),
            "Windows 11 Pro 24H2 (build 26100)"
        );
    }

    #[test]
    fn formats_windows_platform_detail_with_fallbacks() {
        assert_eq!(format_windows_platform_detail(None, None, None), "Windows");
        assert_eq!(
            format_windows_platform_detail(Some("Windows 10 Pro"), None, Some("19045")),
            "Windows 10 Pro (build 19045)"
        );
        assert_eq!(
            format_windows_platform_detail(None, Some("22H2"), Some("19045")),
            "Windows 22H2 (build 19045)"
        );
    }

    #[test]
    fn get_system_info_reads_registry_backed_detail() {
        let info = get_system_info();
        assert!(
            info.platform_detail.contains("(build "),
            "expected registry-backed platform_detail, got: {}",
            info.platform_detail
        );
        assert_ne!(info.platform_detail, "Windows");
    }
}
