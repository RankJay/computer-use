//! Non-interactive filesystem smoke: symlink identity via public commands.
//!
//! Runs in normal `cargo test` (no `--ignored`). Live TCC denial is covered by
//! `path_utils::maps_permission_denied` unit tests, not here.

use std::fs;

use actuate_lib::{delete_path, duplicate_path, stat_path};

fn temp_workspace() -> (std::path::PathBuf, std::path::PathBuf) {
    let cleanup = std::env::temp_dir().join(format!(
        "actuate-fs-smoke-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ));
    let _ = fs::create_dir_all(&cleanup);
    let root = cleanup.canonicalize().expect("temp dir");
    (root, cleanup)
}

#[test]
fn symlink_stat_duplicate_delete_roundtrip() {
    let (root, cleanup) = temp_workspace();
    let root_s = root.to_string_lossy().to_string();
    fs::write(root.join("target.txt"), "data").expect("write target");

    #[cfg(unix)]
    std::os::unix::fs::symlink("target.txt", root.join("link.txt")).expect("symlink");

    #[cfg(windows)]
    {
        if std::os::windows::fs::symlink_file("target.txt", root.join("link.txt")).is_err() {
            let _ = fs::remove_dir_all(&cleanup);
            return;
        }
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = fs::remove_dir_all(&cleanup);
        return;
    }

    let statted = stat_path("link.txt".into(), root_s.clone()).expect("stat link");
    assert_eq!(statted.kind, "symlink");

    let duplicated = duplicate_path("link.txt".into(), "link-copy.txt".into(), root_s.clone())
        .expect("duplicate link");
    assert_eq!(duplicated.kind, "symlink");
    assert!(
        fs::symlink_metadata(root.join("link-copy.txt"))
            .expect("lstat copy")
            .is_symlink()
    );

    delete_path("link.txt".into(), root_s).expect("delete link");
    assert!(!fs::symlink_metadata(root.join("link.txt")).is_ok());
    assert_eq!(
        fs::read_to_string(root.join("target.txt")).expect("target intact"),
        "data"
    );

    let _ = fs::remove_dir_all(cleanup);
}
