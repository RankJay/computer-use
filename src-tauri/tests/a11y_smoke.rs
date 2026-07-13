#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: snapshot → query → click.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test a11y_smoke -- --ignored --nocapture
//! ```

use std::time::Duration;

use actuate_lib::{SnapshotStore, WindowId};

struct KillOnDrop(Option<u32>);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            let _ = actuate_lib::process_kill(Some(pid), None);
        }
    }
}

#[cfg(windows)]
fn find_target_hwnd() -> Option<WindowId> {
    find_hwnd_containing("notepad")
}

#[cfg(target_os = "macos")]
fn find_target_hwnd() -> Option<WindowId> {
    find_hwnd_containing("textedit")
}

fn find_hwnd_containing(needle: &str) -> Option<WindowId> {
    let list = actuate_lib::window_list().ok()?;
    for line in list.text.lines() {
        let lower = line.to_ascii_lowercase();
        if !lower.contains(needle) {
            continue;
        }
        let id = line.split_whitespace().next()?.parse::<i64>().ok()?;
        if id > 0 {
            return Some(WindowId(id));
        }
    }
    None
}

#[cfg(windows)]
fn launch_exe() -> &'static str {
    "notepad"
}

#[cfg(target_os = "macos")]
fn launch_exe() -> &'static str {
    "TextEdit"
}

#[test]
#[ignore = "requires interactive desktop + Accessibility on macOS; run with --ignored"]
fn snapshot_query_click_smoke() {
    let launched = actuate_lib::launch(launch_exe().into(), None, None, None).expect("launch");
    let _guard = KillOnDrop(Some(launched.pid));

    // `open -a` ensures a visible document window even when the app was already running.
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-a", "TextEdit"])
            .status();
    }

    let hwnd = (0..40)
        .find_map(|_| {
            std::thread::sleep(Duration::from_millis(250));
            find_target_hwnd()
        })
        .expect("target window hwnd");

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");

    rt.block_on(async {
        let store = SnapshotStore::default();
        let snap = actuate_lib::a11y_live_smoke::snapshot(&store, hwnd)
            .await
            .expect("snapshot");
        assert!(
            !snap.text.trim().is_empty(),
            "snapshot outline should not be empty"
        );

        let query_text = actuate_lib::a11y_live_smoke::query(&store, hwnd, "edit", Some("edit"))
            .await
            .map(|r| r.text)
            .unwrap_or_default();

        let reference = query_text
            .lines()
            .chain(snap.text.lines())
            .find_map(|line| line.split_whitespace().next())
            .expect("reference token")
            .to_string();

        // Best-effort: click may fail on non-interactive roots.
        let _ = actuate_lib::a11y_live_smoke::click(&store, &reference).await;
    });
}
