#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: input synthesizer.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test input_smoke -- --ignored --nocapture
//! ```

#[test]
#[ignore = "requires interactive desktop + Accessibility on macOS; run with --ignored"]
fn mouse_move_and_key_press_smoke() {
    actuate_lib::smoke_support::require_macos_automation(true);

    actuate_lib::mouse_move(200, 200).expect("mouse_move");
    actuate_lib::key_press("a".into(), Some(1)).expect("key_press");
}

#[test]
#[ignore = "requires interactive desktop + Accessibility on macOS; run with --ignored"]
fn modifier_hotkey_smoke() {
    actuate_lib::smoke_support::require_macos_automation(true);

    // macOS: Cmd; Windows: Ctrl. Both aliases resolve to the platform meta/control chord.
    #[cfg(target_os = "macos")]
    let keys = vec!["cmd".into(), "a".into()];
    #[cfg(windows)]
    let keys = vec!["ctrl".into(), "a".into()];

    actuate_lib::hotkey(keys).expect("hotkey");
}
