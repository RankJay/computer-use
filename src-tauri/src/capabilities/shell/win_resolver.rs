//! Windows executable resolution: App Paths → well-known locations → PATH (.exe form).

use std::path::{Path, PathBuf};

use crate::capabilities::error::CommandError;

use super::resolver::{as_path_literal, ExecutableResolver, ResolvedExecutable};

pub struct WinResolver;

impl ExecutableResolver for WinResolver {
    fn resolve(&self, name: &str) -> Result<ResolvedExecutable, CommandError> {
        if let Some(path) = as_path_literal(name) {
            return Ok(ResolvedExecutable { path });
        }

        let trimmed = name.trim();
        let normalized = normalize_exe_name(trimmed);

        if let Some(from_app_paths) = lookup_app_paths(&normalized) {
            return Ok(ResolvedExecutable {
                path: from_app_paths,
            });
        }

        for candidate in well_known_paths(&normalized) {
            if candidate.exists() {
                return Ok(ResolvedExecutable {
                    path: candidate.to_string_lossy().into_owned(),
                });
            }
        }

        // Prefer the .exe form for CreateProcess PATH search.
        let path = if !trimmed.to_ascii_lowercase().ends_with(".exe") {
            normalized
        } else {
            trimmed.to_string()
        };
        Ok(ResolvedExecutable { path })
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
    use crate::capabilities::shell::resolver::resolver;

    #[test]
    fn resolve_passes_through_paths() {
        let r = WinResolver;
        assert_eq!(
            r.resolve(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
                .expect("resolve")
                .path,
            r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        );
        assert_eq!(
            r.resolve(r".\relative\tool.exe").expect("resolve").path,
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
        let resolved = resolver().resolve("chrome").expect("resolve").path;
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
