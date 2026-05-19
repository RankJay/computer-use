use crate::app_paths::{resolve_workspace_dir, resolve_workspace_path};
use std::fs;
use tauri::AppHandle;

const MAX_READ_BYTES: usize = 2 * 1024 * 1024;

fn read_workspace_file_at(workspace_root: &str, relative_path: &str) -> Result<String, String> {
    let path = resolve_workspace_path(workspace_root, relative_path, true)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_READ_BYTES {
        return Err(format!(
            "file too large (max {MAX_READ_BYTES} bytes): {:?}",
            path
        ));
    }
    String::from_utf8(bytes).map_err(|e| format!("file is not valid UTF-8: {e}"))
}

fn write_workspace_file_at(
    workspace_root: &str,
    relative_path: &str,
    content: &str,
) -> Result<String, String> {
    let path = resolve_workspace_path(workspace_root, relative_path, false)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn list_workspace_dir_at(workspace_root: &str, relative_dir: &str) -> Result<Vec<String>, String> {
    let base = resolve_workspace_dir(workspace_root, relative_dir)?;

    let mut names = Vec::new();
    for entry in fs::read_dir(&base).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn read_workspace_file(
    _app: AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    read_workspace_file_at(&workspace_root, &relative_path)
}

#[tauri::command]
pub fn write_workspace_file(
    _app: AppHandle,
    workspace_root: String,
    relative_path: String,
    content: String,
) -> Result<String, String> {
    write_workspace_file_at(&workspace_root, &relative_path, &content)
}

#[tauri::command]
pub fn list_workspace_dir(
    _app: AppHandle,
    workspace_root: String,
    relative_dir: String,
) -> Result<Vec<String>, String> {
    list_workspace_dir_at(&workspace_root, &relative_dir)
}

#[cfg(test)]
mod tests {
    use super::{
        list_workspace_dir_at, read_workspace_file_at, write_workspace_file_at, MAX_READ_BYTES,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("actuate-ws-fs-test-{id}"));
        fs::create_dir_all(&path).expect("create temp workspace");
        path
    }

    #[test]
    fn write_and_read_round_trip() {
        let workspace = temp_workspace();
        let root = workspace.to_str().expect("utf-8 path");

        write_workspace_file_at(root, "nested/hello.txt", "hello world").expect("write file");
        let content = read_workspace_file_at(root, "nested/hello.txt").expect("read file");

        assert_eq!(content, "hello world");
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn list_workspace_dir_returns_sorted_names() {
        let workspace = temp_workspace();
        let root = workspace.to_str().expect("utf-8 path");
        fs::write(workspace.join("b.txt"), "b").expect("write b");
        fs::write(workspace.join("a.txt"), "a").expect("write a");
        fs::create_dir_all(workspace.join("dir")).expect("create dir");

        let names = list_workspace_dir_at(root, ".").expect("list root");

        assert_eq!(names, vec!["a.txt", "b.txt", "dir"]);
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn read_rejects_oversized_file() {
        let workspace = temp_workspace();
        let root = workspace.to_str().expect("utf-8 path");
        let oversized = vec![b'a'; MAX_READ_BYTES + 1];
        fs::write(workspace.join("big.txt"), oversized).expect("write big file");

        let result = read_workspace_file_at(root, "big.txt");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("file too large"));
        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn read_rejects_non_utf8_file() {
        let workspace = temp_workspace();
        let root = workspace.to_str().expect("utf-8 path");
        fs::write(workspace.join("binary.bin"), [0xff, 0xfe]).expect("write binary");

        let result = read_workspace_file_at(root, "binary.bin");

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not valid UTF-8"));
        let _ = fs::remove_dir_all(workspace);
    }
}
