#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: window list + active window wire shape.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test window_smoke -- --ignored --nocapture
//! ```

#[test]
#[ignore = "requires interactive desktop + Accessibility on macOS; run with --ignored"]
fn window_list_and_active_smoke() {
    actuate_lib::smoke_support::require_macos_automation(false);

    let list = actuate_lib::window_list().expect("window_list");
    assert!(
        list.text.lines().any(|line| !line.trim().is_empty()),
        "expected at least one window line"
    );
    let first = list.text.lines().next().expect("line");
    let window_id_token = first.split_whitespace().next().expect("window id token");
    assert!(
        window_id_token.parse::<i64>().is_ok_and(|v| v > 0),
        "expected positive window id in list line, got {first:?}"
    );

    let active = actuate_lib::get_active_window().expect("get_active_window");
    assert!(active.id.0 > 0, "active windowId must be positive");
    let json = serde_json::to_value(&active).expect("serialize");
    assert!(
        json.get("windowId")
            .and_then(|v| v.as_i64())
            .is_some_and(|v| v > 0),
        "active window JSON must use windowId key: {json}"
    );
}
