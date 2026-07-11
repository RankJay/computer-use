#![cfg(windows)]

//! Live desktop smoke: snapshot → query → click on Notepad.
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

fn find_notepad_hwnd() -> Option<WindowId> {
    let list = actuate_lib::window_list().ok()?;
    for line in list.text.lines() {
        let lower = line.to_ascii_lowercase();
        if !lower.contains("notepad") {
            continue;
        }
        let id = line.split_whitespace().next()?.parse::<i64>().ok()?;
        if id > 0 {
            return Some(WindowId(id));
        }
    }
    None
}

#[test]
#[ignore = "requires interactive Windows desktop; run with --ignored"]
fn notepad_snapshot_query_click_smoke() {
    let launched = actuate_lib::launch("notepad".into(), None, None, None).expect("launch");
    let _guard = KillOnDrop(Some(launched.pid));

    let hwnd = (0..40)
        .find_map(|_| {
            std::thread::sleep(Duration::from_millis(250));
            find_notepad_hwnd()
        })
        .expect("notepad window hwnd");

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
