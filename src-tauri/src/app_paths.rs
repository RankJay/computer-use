use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

pub fn logs_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("logs"))
}

pub fn sessions_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(logs_root(app)?.join("sessions"))
}

pub fn session_dir(app: &AppHandle, session_id: &str) -> Result<PathBuf, String> {
    let folder = sanitize_session_id(session_id);
    let folder = if folder.is_empty() {
        "default".to_string()
    } else {
        folder
    };
    Ok(sessions_dir(app)?.join(folder))
}

fn sanitize_session_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(120)
        .collect::<String>()
}

fn canonical_workspace_root(workspace_root: &str) -> Result<PathBuf, String> {
    let ws = Path::new(workspace_root.trim());
    if ws.as_os_str().is_empty() {
        return Err("workspace_root is empty".into());
    }
    ws.canonicalize()
        .map_err(|e| format!("workspace_root not found: {e}"))
}

fn normalized_relative_segments(relative: &str, allow_empty: bool) -> Result<Vec<String>, String> {
    let rel_norm = relative.trim().replace('\\', "/");
    if rel_norm.is_empty() {
        return if allow_empty {
            Ok(Vec::new())
        } else {
            Err("relative path is empty".into())
        };
    }
    if Path::new(&rel_norm).is_absolute() {
        return Err("relative path must not be absolute".into());
    }
    if rel_norm.split('/').any(|seg| seg == "..") {
        return Err("relative path must not contain parent segments".into());
    }

    Ok(rel_norm
        .split('/')
        .filter(|seg| !seg.is_empty() && *seg != ".")
        .map(|seg| seg.to_string())
        .collect())
}

fn workspace_path_from_segments(ws_canon: &Path, segments: &[String]) -> PathBuf {
    let mut out = ws_canon.to_path_buf();
    for seg in segments {
        out.push(seg);
    }
    out
}

fn ensure_existing_path_inside(ws_canon: &Path, out: &Path) -> Result<PathBuf, String> {
    if !out.exists() {
        return Err(format!("path not found: {out:?}"));
    }
    let canon = out.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(ws_canon) {
        return Err("path escapes workspace".into());
    }
    Ok(canon)
}

fn nearest_existing_ancestor(path: &Path) -> Option<&Path> {
    let mut current = Some(path);
    while let Some(candidate) = current {
        if candidate.exists() {
            return Some(candidate);
        }
        current = candidate.parent();
    }
    None
}

fn ensure_write_path_inside(ws_canon: &Path, out: &Path) -> Result<PathBuf, String> {
    if !out.starts_with(ws_canon) {
        return Err("path escapes workspace".into());
    }

    let existing =
        nearest_existing_ancestor(out).ok_or_else(|| "workspace_root not found".to_string())?;
    let canon = existing.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(ws_canon) {
        return Err("path escapes workspace".into());
    }
    Ok(out.to_path_buf())
}

/// Resolve `relative` under `workspace_root`; rejects `..` and absolute paths.
/// When `must_exist` is false, the returned path may not exist yet (e.g. new file write).
pub fn resolve_workspace_path(
    workspace_root: &str,
    relative: &str,
    must_exist: bool,
) -> Result<PathBuf, String> {
    let ws_canon = canonical_workspace_root(workspace_root)?;
    let segments = normalized_relative_segments(relative, false)?;
    let out = workspace_path_from_segments(&ws_canon, &segments);

    if must_exist {
        ensure_existing_path_inside(&ws_canon, &out)
    } else {
        ensure_write_path_inside(&ws_canon, &out)
    }
}

/// Resolve a directory under `workspace_root`; empty and `.` mean the root itself.
pub fn resolve_workspace_dir(workspace_root: &str, relative: &str) -> Result<PathBuf, String> {
    let ws_canon = canonical_workspace_root(workspace_root)?;
    let segments = normalized_relative_segments(relative, true)?;
    if segments.is_empty() {
        return Ok(ws_canon);
    }

    let out = workspace_path_from_segments(&ws_canon, &segments);
    let canon = ensure_existing_path_inside(&ws_canon, &out)?;
    if !canon.is_dir() {
        return Err(format!("not a directory: {canon:?}"));
    }
    Ok(canon)
}

#[cfg(test)]
mod tests {
    use super::{resolve_workspace_dir, resolve_workspace_path};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("actuate-path-test-{id}"));
        fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

    #[test]
    fn resolve_workspace_path_rejects_parent_segments() {
        let workspace = temp_workspace();
        let result = resolve_workspace_path(workspace.to_str().unwrap_or_default(), "../x", true);

        assert!(result.is_err());
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn resolve_workspace_path_allows_new_nested_write_path() {
        let workspace = temp_workspace();
        let result = resolve_workspace_path(
            workspace.to_str().unwrap_or_default(),
            "new/file.txt",
            false,
        )
        .expect("new nested write path should resolve");

        assert!(result.ends_with("new/file.txt"));
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn resolve_workspace_dir_allows_workspace_root() {
        let workspace = temp_workspace();
        let result = resolve_workspace_dir(workspace.to_str().unwrap_or_default(), ".")
            .expect("root directory should resolve");

        assert_eq!(
            result,
            workspace.canonicalize().expect("canonical workspace")
        );
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn resolve_workspace_write_rejects_existing_symlink_parent_escape() {
        let workspace = temp_workspace();
        let outside = temp_workspace();
        let link = workspace.join("linked");

        if create_dir_symlink(&outside, &link).is_err() {
            let _ = fs::remove_dir_all(workspace);
            let _ = fs::remove_dir_all(outside);
            return;
        }

        let result = resolve_workspace_path(
            workspace.to_str().unwrap_or_default(),
            "linked/file.txt",
            false,
        );

        assert!(result.is_err());
        let _ = fs::remove_dir_all(workspace);
        let _ = fs::remove_dir_all(outside);
    }

    #[cfg(unix)]
    fn create_dir_symlink(source: &PathBuf, link: &PathBuf) -> std::io::Result<()> {
        std::os::unix::fs::symlink(source, link)
    }

    #[cfg(windows)]
    fn create_dir_symlink(source: &PathBuf, link: &PathBuf) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(source, link)
    }
}
