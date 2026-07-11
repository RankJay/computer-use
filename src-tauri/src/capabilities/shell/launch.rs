use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

use super::common::resolve_cwd;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub pid: u32,
    pub exe: String,
}

#[tauri::command]
pub fn launch(
    exe: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<LaunchResult, CommandError> {
    let exe = exe.trim().to_string();
    if exe.is_empty() {
        return Err(CommandError::new(
            "invalid_exe",
            "Executable must not be empty",
        ));
    }

    let resolved = resolve_executable(&exe);
    let working_dir = resolve_cwd(cwd.as_deref())?;

    let mut command = std::process::Command::new(&resolved);
    command
        .args(args.unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dir) = &working_dir {
        command.current_dir(dir);
    }

    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            command.env(key, value);
        }
    }

    let child = command.spawn().map_err(|error| {
        CommandError::new("spawn_failed", format!("Failed to launch process: {error}"))
    })?;

    Ok(LaunchResult {
        pid: child.id(),
        exe: resolved,
    })
}

/// Resolve a bare app name (e.g. `chrome`) to a spawnable path.
/// Absolute/relative paths pass through. Bare names try App Paths, then well-known locations, then PATH via CreateProcess.
pub(crate) fn resolve_executable(exe: &str) -> String {
    let trimmed = exe.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }

    let path = Path::new(trimmed);
    if path.is_absolute() || trimmed.contains(['/', '\\']) {
        return trimmed.to_string();
    }
    if path.exists() {
        return trimmed.to_string();
    }

    let normalized = normalize_exe_name(trimmed);

    #[cfg(windows)]
    if let Some(from_app_paths) = lookup_app_paths(&normalized) {
        return from_app_paths;
    }

    for candidate in well_known_paths(&normalized) {
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }

    // Prefer the .exe form for CreateProcess PATH search on Windows.
    if cfg!(windows) && !trimmed.to_ascii_lowercase().ends_with(".exe") {
        normalized
    } else {
        trimmed.to_string()
    }
}

fn normalize_exe_name(exe: &str) -> String {
    let lower = exe.trim().to_ascii_lowercase();
    match lower.as_str() {
        "edge" | "msedge" => "msedge.exe".into(),
        "chrome" => "chrome.exe".into(),
        "firefox" => "firefox.exe".into(),
        "code" | "vscode" => "code.exe".into(),
        "notepad" => "notepad.exe".into(),
        "explorer" => "explorer.exe".into(),
        "calc" | "calculator" => "calc.exe".into(),
        other if other.ends_with(".exe") => other.to_string(),
        other => format!("{other}.exe"),
    }
}

fn well_known_paths(exe_name: &str) -> Vec<PathBuf> {
    let lower = exe_name.to_ascii_lowercase();
    let program_files = std::env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    let program_files_x86 = std::env::var_os("ProgramFiles(x86)")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files (x86)"));
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);

    match lower.as_str() {
        "chrome.exe" => {
            let mut paths = vec![
                program_files.join(r"Google\Chrome\Application\chrome.exe"),
                program_files_x86.join(r"Google\Chrome\Application\chrome.exe"),
            ];
            if let Some(local) = local_app_data {
                paths.push(local.join(r"Google\Chrome\Application\chrome.exe"));
            }
            paths
        }
        "msedge.exe" => vec![
            program_files.join(r"Microsoft\Edge\Application\msedge.exe"),
            program_files_x86.join(r"Microsoft\Edge\Application\msedge.exe"),
        ],
        "firefox.exe" => vec![
            program_files.join(r"Mozilla Firefox\firefox.exe"),
            program_files_x86.join(r"Mozilla Firefox\firefox.exe"),
        ],
        "code.exe" => {
            let mut paths = vec![program_files.join(r"Microsoft VS Code\Code.exe")];
            if let Some(local) = local_app_data {
                paths.insert(0, local.join(r"Programs\Microsoft VS Code\Code.exe"));
            }
            paths
        }
        "notepad.exe" => vec![
            PathBuf::from(r"C:\Windows\System32\notepad.exe"),
            PathBuf::from(r"C:\Windows\notepad.exe"),
        ],
        "explorer.exe" => vec![PathBuf::from(r"C:\Windows\explorer.exe")],
        "calc.exe" => vec![PathBuf::from(r"C:\Windows\System32\calc.exe")],
        _ => Vec::new(),
    }
}

#[cfg(windows)]
fn lookup_app_paths(exe_name: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ,
    };

    let subkey = format!(r"Software\Microsoft\Windows\CurrentVersion\App Paths\{exe_name}");
    let subkey_wide: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();

    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let mut size = 0u32;
        let probe = unsafe {
            RegGetValueW(
                root,
                PCWSTR(subkey_wide.as_ptr()),
                PCWSTR::null(),
                RRF_RT_REG_SZ,
                None,
                None,
                Some(&mut size),
            )
        };
        if probe != ERROR_SUCCESS || size == 0 {
            continue;
        }

        let mut buffer = vec![0u16; (size as usize / 2).max(1)];
        let mut buf_bytes = (buffer.len() * 2) as u32;
        let status = unsafe {
            RegGetValueW(
                root,
                PCWSTR(subkey_wide.as_ptr()),
                PCWSTR::null(),
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&mut buf_bytes),
            )
        };
        if status != ERROR_SUCCESS {
            continue;
        }

        let len = (buf_bytes as usize / 2).saturating_sub(1);
        let raw = String::from_utf16_lossy(&buffer[..len.min(buffer.len())]);
        let expanded = expand_env_strings(&raw);
        let candidate = expanded.trim().trim_matches('"');
        if candidate.is_empty() {
            continue;
        }
        if Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
        // Return even if existence check fails (WOW64 / delayed install paths).
        return Some(candidate.to_string());
    }

    None
}

#[cfg(windows)]
fn expand_env_strings(value: &str) -> String {
    use windows::core::PCWSTR;
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;

    if !value.contains('%') {
        return value.to_string();
    }
    let source: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
    let needed = unsafe { ExpandEnvironmentStringsW(PCWSTR(source.as_ptr()), None) };
    if needed == 0 {
        return value.to_string();
    }
    let mut dest = vec![0u16; needed as usize];
    let written = unsafe { ExpandEnvironmentStringsW(PCWSTR(source.as_ptr()), Some(&mut dest)) };
    if written == 0 {
        return value.to_string();
    }
    String::from_utf16_lossy(&dest[..written as usize - 1])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_exe() {
        let error = launch("  ".to_string(), None, None, None).expect_err("empty exe");
        assert_eq!(error.code, "invalid_exe");
    }

    #[test]
    fn resolve_passes_through_paths() {
        assert_eq!(
            resolve_executable(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        );
        assert_eq!(
            resolve_executable(r".\relative\tool.exe"),
            r".\relative\tool.exe"
        );
    }

    #[test]
    fn normalize_common_aliases() {
        assert_eq!(normalize_exe_name("chrome"), "chrome.exe");
        assert_eq!(normalize_exe_name("Edge"), "msedge.exe");
        assert_eq!(normalize_exe_name("vscode"), "code.exe");
        assert_eq!(normalize_exe_name("FIREFOX.EXE"), "firefox.exe");
    }

    #[test]
    fn resolve_chrome_finds_installed_binary() {
        let resolved = resolve_executable("chrome");
        assert!(
            resolved.to_ascii_lowercase().ends_with("chrome.exe"),
            "expected chrome.exe path, got {resolved}"
        );
        assert!(
            Path::new(&resolved).exists() || resolved == "chrome.exe",
            "resolved path should exist or fall back to PATH name: {resolved}"
        );
    }
}
