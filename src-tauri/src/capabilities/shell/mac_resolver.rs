//! macOS executable resolution: aliases → Applications dirs → bundle binary → PATH.

use std::path::{Path, PathBuf};

use crate::capabilities::error::CommandError;

use super::resolver::{as_path_literal, ExecutableResolver, ResolvedExecutable};

pub struct MacResolver;

impl ExecutableResolver for MacResolver {
    fn resolve(&self, name: &str) -> Result<ResolvedExecutable, CommandError> {
        if let Some(path) = as_path_literal(name) {
            return Ok(ResolvedExecutable::cli(path));
        }

        let trimmed = name.trim();
        for bundle_name in candidate_bundle_names(trimmed) {
            if let Some((exe, bundle)) = find_app_executable(&bundle_name) {
                return Ok(ResolvedExecutable::bundle(exe, bundle));
            }
        }

        // Prefer bare name for CreateProcess-style PATH search (no .exe suffixing).
        Ok(ResolvedExecutable::cli(trimmed.to_string()))
    }
}

/// Map short names / aliases to `.app` bundle names; also try `{name}.app`.
fn candidate_bundle_names(name: &str) -> Vec<String> {
    let lower = name.to_ascii_lowercase();
    let aliased = match lower.as_str() {
        "chrome" | "google chrome" | "google chrome.app" => Some("Google Chrome.app"),
        "edge" | "msedge" | "microsoft edge" | "microsoft edge.app" => Some("Microsoft Edge.app"),
        "firefox" | "firefox.app" => Some("Firefox.app"),
        "code" | "vscode" | "visual studio code" | "visual studio code.app" => {
            Some("Visual Studio Code.app")
        }
        "cursor" | "cursor.app" => Some("Cursor.app"),
        "terminal" | "terminal.app" => Some("Terminal.app"),
        "textedit" | "text edit" | "textedit.app" => Some("TextEdit.app"),
        "safari" | "safari.app" => Some("Safari.app"),
        "calculator" | "calc" | "calculator.app" => Some("Calculator.app"),
        _ => None,
    };

    let mut names = Vec::new();
    if let Some(bundle) = aliased {
        names.push(bundle.to_string());
    }

    let with_app = if lower.ends_with(".app") {
        name.to_string()
    } else {
        format!("{name}.app")
    };
    if !names
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&with_app))
    {
        names.push(with_app);
    }

    names
}

fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs
}

fn find_app_executable(bundle_name: &str) -> Option<(String, String)> {
    for dir in search_dirs() {
        let bundle = dir.join(bundle_name);
        if !bundle.is_dir() {
            continue;
        }
        if let Some(exe) = resolve_bundle_executable(&bundle) {
            return Some((
                exe.to_string_lossy().into_owned(),
                bundle.to_string_lossy().into_owned(),
            ));
        }
    }
    None
}

fn resolve_bundle_executable(app_bundle: &Path) -> Option<PathBuf> {
    let info_plist = app_bundle.join("Contents/Info.plist");
    let exe_name = read_cf_bundle_executable(&info_plist).or_else(|| {
        app_bundle
            .file_stem()
            .and_then(|s| s.to_str())
            .map(str::to_string)
    })?;

    let path = app_bundle.join("Contents/MacOS").join(&exe_name);
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn read_cf_bundle_executable(info_plist: &Path) -> Option<String> {
    let value = plist::Value::from_file(info_plist).ok()?;
    value
        .as_dictionary()?
        .get("CFBundleExecutable")?
        .as_string()
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::shell::resolver::resolver;

    #[test]
    fn resolve_passes_through_absolute_paths() {
        let r = MacResolver;
        let true_resolved = r.resolve("/usr/bin/true").expect("resolve");
        assert_eq!(true_resolved.path, "/usr/bin/true");
        assert_eq!(true_resolved.app_bundle, None);
        assert_eq!(r.resolve("/bin/ls").expect("resolve").path, "/bin/ls");
    }

    #[test]
    fn resolve_passes_through_paths_with_separators() {
        let r = MacResolver;
        assert_eq!(
            r.resolve("./relative/tool").expect("resolve").path,
            "./relative/tool"
        );
    }

    #[test]
    fn unknown_bare_name_returns_path_style_string() {
        let r = MacResolver;
        assert_eq!(
            r.resolve("definitely-not-an-installed-app-xyz")
                .expect("resolve")
                .path,
            "definitely-not-an-installed-app-xyz"
        );
    }

    #[test]
    fn candidate_aliases_map_common_apps() {
        assert_eq!(
            candidate_bundle_names("chrome"),
            vec!["Google Chrome.app".to_string(), "chrome.app".to_string()]
        );
        assert_eq!(
            candidate_bundle_names("vscode"),
            vec![
                "Visual Studio Code.app".to_string(),
                "vscode.app".to_string()
            ]
        );
        assert_eq!(
            candidate_bundle_names("calc"),
            vec!["Calculator.app".to_string(), "calc.app".to_string()]
        );
        assert_eq!(
            candidate_bundle_names("TextEdit"),
            vec!["TextEdit.app".to_string()]
        );
    }

    #[test]
    fn resolve_textedit_finds_bundle_binary() {
        let textedit = Path::new("/System/Applications/TextEdit.app");
        if !textedit.is_dir() {
            return;
        }

        let resolved = resolver().resolve("TextEdit").expect("resolve");
        assert!(
            resolved.path.ends_with("Contents/MacOS/TextEdit"),
            "expected TextEdit MacOS binary, got {}",
            resolved.path
        );
        assert!(
            Path::new(&resolved.path).is_file(),
            "resolved path should exist: {}",
            resolved.path
        );
        assert_eq!(
            resolved.app_bundle.as_deref(),
            Some("/System/Applications/TextEdit.app")
        );
    }

    #[test]
    fn resolve_terminal_alias_finds_bundle_binary() {
        let terminal = Path::new("/System/Applications/Utilities/Terminal.app");
        if !terminal.is_dir() {
            return;
        }

        let resolved = resolver().resolve("terminal").expect("resolve");
        assert!(
            resolved.path.ends_with("Contents/MacOS/Terminal"),
            "expected Terminal MacOS binary, got {}",
            resolved.path
        );
        assert!(Path::new(&resolved.path).is_file());
        assert_eq!(
            resolved.app_bundle.as_deref(),
            Some("/System/Applications/Utilities/Terminal.app")
        );
    }

    #[test]
    fn resolve_chrome_when_installed() {
        let chrome = Path::new("/Applications/Google Chrome.app");
        if !chrome.is_dir() {
            return;
        }

        let resolved = resolver().resolve("chrome").expect("resolve");
        assert!(
            resolved.path.contains("Google Chrome.app/Contents/MacOS/"),
            "expected Chrome MacOS binary, got {}",
            resolved.path
        );
        assert!(Path::new(&resolved.path).is_file());
        assert_eq!(
            resolved.app_bundle.as_deref(),
            Some("/Applications/Google Chrome.app")
        );
    }
}
