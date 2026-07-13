#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: launch by name and full path.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test launch_smoke -- --ignored --nocapture
//! ```

struct KillOnDrop(Option<u32>);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            let _ = actuate_lib::process_kill(Some(pid), None);
        }
    }
}

#[cfg(windows)]
#[test]
#[ignore = "requires interactive Windows desktop; run with --ignored"]
fn launch_notepad_by_name_and_path() {
    {
        let launched =
            actuate_lib::launch("notepad".into(), None, None, None).expect("launch name");
        assert!(launched.pid > 0);
        assert!(
            launched.exe.to_ascii_lowercase().contains("notepad"),
            "resolved exe: {}",
            launched.exe
        );
        let _guard = KillOnDrop(Some(launched.pid));
        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    {
        let launched =
            actuate_lib::launch(r"C:\Windows\System32\notepad.exe".into(), None, None, None)
                .expect("launch path");
        assert!(launched.pid > 0);
        let _guard = KillOnDrop(Some(launched.pid));
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
}

#[cfg(target_os = "macos")]
#[test]
#[ignore = "requires interactive macOS desktop; run with --ignored"]
fn launch_textedit_by_name_and_path() {
    // Launch itself does not need Accessibility; keep the assert for dogfood host setup.
    actuate_lib::smoke_support::require_macos_automation(false);

    {
        let launched =
            actuate_lib::launch("TextEdit".into(), None, None, None).expect("launch name");
        assert!(launched.pid > 0);
        assert!(
            launched.exe.contains("TextEdit"),
            "resolved exe: {}",
            launched.exe
        );
        let _guard = KillOnDrop(Some(launched.pid));
        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    {
        let launched =
            actuate_lib::launch("/bin/ls".into(), None, None, None).expect("launch path");
        assert!(launched.pid > 0);
        let _guard = KillOnDrop(Some(launched.pid));
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    {
        let app = if std::path::Path::new("/System/Applications/TextEdit.app").exists() {
            "/System/Applications/TextEdit.app"
        } else {
            "/Applications/TextEdit.app"
        };
        let launched = actuate_lib::launch(app.into(), None, None, None).expect("launch .app");
        assert!(launched.pid > 0);
        assert!(
            launched.exe.contains("TextEdit"),
            "resolved exe: {}",
            launched.exe
        );
        let _guard = KillOnDrop(Some(launched.pid));
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
}
