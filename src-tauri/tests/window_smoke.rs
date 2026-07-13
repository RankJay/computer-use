#![cfg(any(windows, target_os = "macos"))]

//! Live desktop smoke: window list, geometry, and macOS maximize policy.
//!
//! ```text
//! cargo test --manifest-path src-tauri/Cargo.toml --test window_smoke -- --ignored --nocapture
//! ```

#[cfg(target_os = "macos")]
use actuate_lib::WindowId;
use actuate_lib::WindowStateOp;

/// CI-safe: maximize/restore are typed unavailable on macOS (no live window needed).
#[cfg(target_os = "macos")]
#[test]
fn macos_maximize_and_restore_unavailable() {
    for op in [WindowStateOp::Maximize, WindowStateOp::Restore] {
        let error = actuate_lib::window_state(WindowId(1), op).expect_err("unavailable");
        assert_eq!(error.code, "action_unavailable");
    }
}

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

#[test]
#[ignore = "requires interactive desktop + Accessibility on macOS; run with --ignored"]
fn window_move_resize_smoke() {
    actuate_lib::smoke_support::require_macos_automation(false);

    let active = actuate_lib::get_active_window().expect("get_active_window");
    let id = active.id;

    actuate_lib::window_move(id, 80, 80).expect("window_move");
    actuate_lib::window_resize(id, 640, 480).expect("window_resize");

    #[cfg(target_os = "macos")]
    {
        let error = actuate_lib::window_state(id, WindowStateOp::Maximize)
            .expect_err("maximize unavailable");
        assert_eq!(error.code, "action_unavailable");
    }

    #[cfg(windows)]
    {
        actuate_lib::window_state(id, WindowStateOp::Maximize).expect("maximize");
        actuate_lib::window_state(id, WindowStateOp::Restore).expect("restore");
    }
}
