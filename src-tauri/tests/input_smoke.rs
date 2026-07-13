#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: input synthesizer.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test input_smoke -- --ignored --nocapture
//! ```

#[test]
#[ignore = "requires interactive desktop + Accessibility/Input Monitoring on macOS; run with --ignored"]
fn mouse_move_and_key_press_smoke() {
    actuate_lib::mouse_move(200, 200).expect("mouse_move");
    actuate_lib::key_press("a".into(), Some(1)).expect("key_press");
}
