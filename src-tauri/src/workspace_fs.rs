use crate::app_paths::resolve_workspace_path;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

const MAX_READ_BYTES: usize = 2 * 1024 * 1024;

#[tauri::command]
pub fn read_workspace_file(
    _app: AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    let path = resolve_workspace_path(&workspace_root, &relative_path, true)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_READ_BYTES {
        return Err(format!(
            "file too large (max {MAX_READ_BYTES} bytes): {:?}",
            path
        ));
    }
    String::from_utf8(bytes).map_err(|e| format!("file is not valid UTF-8: {e}"))
}

#[tauri::command]
pub fn write_workspace_file(
    _app: AppHandle,
    workspace_root: String,
    relative_path: String,
    content: String,
) -> Result<String, String> {
    let path = resolve_workspace_path(&workspace_root, &relative_path, false)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_workspace_dir(
    _app: AppHandle,
    workspace_root: String,
    relative_dir: String,
) -> Result<Vec<String>, String> {
    let ws = Path::new(workspace_root.trim());
    if ws.as_os_str().is_empty() {
        return Err("workspace_root is empty".into());
    }
    let ws_canon = ws
        .canonicalize()
        .map_err(|e| format!("workspace_root not found: {e}"))?;

    let rel_trim = relative_dir.trim().replace('\\', "/");
    let base = if rel_trim.is_empty() || rel_trim == "." {
        ws_canon.clone()
    } else {
        if rel_trim.starts_with('/') {
            return Err("relative path must not be absolute".into());
        }
        if rel_trim.split('/').any(|seg| seg == "..") {
            return Err("relative path must not contain parent segments".into());
        }
        let mut out = ws_canon.clone();
        for seg in rel_trim.split('/') {
            if seg.is_empty() || seg == "." {
                continue;
            }
            out.push(seg);
        }
        if !out.exists() {
            return Err(format!("path not found: {out:?}"));
        }
        let canon = out.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(&ws_canon) {
            return Err("path escapes workspace".into());
        }
        canon
    };

    if !base.is_dir() {
        return Err(format!("not a directory: {base:?}"));
    }

    let mut names = Vec::new();
    for entry in fs::read_dir(&base).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}
