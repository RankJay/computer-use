#![cfg(test)]

use std::fs;
use std::path::PathBuf;

pub fn temp_workspace() -> (PathBuf, PathBuf) {
    let cleanup_path = std::env::temp_dir().join(format!(
        "actuate-fs-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ));
    let _ = fs::create_dir_all(&cleanup_path);
    let root = cleanup_path.canonicalize().expect("canonicalize temp workspace");
    (root, cleanup_path)
}

pub fn cleanup_workspace(cleanup_path: &PathBuf) {
    let _ = fs::remove_dir_all(cleanup_path);
}
