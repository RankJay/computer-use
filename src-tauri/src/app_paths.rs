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

/// Resolve `relative` under `workspace_root`; rejects `..` and absolute paths.
/// When `must_exist` is false, the returned path may not exist yet (e.g. new file write).
pub fn resolve_workspace_path(
    workspace_root: &str,
    relative: &str,
    must_exist: bool,
) -> Result<PathBuf, String> {
    let ws = Path::new(workspace_root.trim());
    if ws.as_os_str().is_empty() {
        return Err("workspace_root is empty".into());
    }
    let ws_canon = ws
        .canonicalize()
        .map_err(|e| format!("workspace_root not found: {e}"))?;

    let rel_norm = relative.trim().replace('\\', "/");
    if rel_norm.is_empty() {
        return Err("relative path is empty".into());
    }
    if rel_norm.starts_with('/') {
        return Err("relative path must not be absolute".into());
    }
    if rel_norm.split('/').any(|seg| seg == "..") {
        return Err("relative path must not contain parent segments".into());
    }

    let mut out = ws_canon.clone();
    for seg in rel_norm.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        out.push(seg);
    }

    if must_exist {
        if !out.exists() {
            return Err(format!("path not found: {out:?}"));
        }
        let canon = out.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(&ws_canon) {
            return Err("path escapes workspace".into());
        }
        Ok(canon)
    } else if !out.starts_with(&ws_canon) {
        Err("path escapes workspace".into())
    } else {
        Ok(out)
    }
}
