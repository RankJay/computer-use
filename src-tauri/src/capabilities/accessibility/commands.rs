use std::time::Duration;

use tauri::State;

use crate::capabilities::path_utils::CommandError;

use super::state::SnapshotStore;
use super::types::{
    ActionResult, GetValueResult, TextResult, MAX_WAIT_MS, TIMEOUT_ACTION_MS, TIMEOUT_EXPAND_MS,
    TIMEOUT_FIND_MS,
};
use super::worker::{map_worker_outcome, run, WorkerOutcome};

#[cfg(target_os = "windows")]
use super::windows_impl;

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
fn unsupported_platform<T>() -> Result<T, CommandError> {
    Err(CommandError::new(
        "unsupported_platform",
        "Accessibility automation is only supported on Windows",
    ))
}

#[tauri::command]
pub async fn accessibility_snapshot(
    store: State<'_, SnapshotStore>,
    hwnd: i64,
    max_depth: Option<u32>,
    max_elements: Option<u32>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        use super::types::SnapshotInput;

        let input = SnapshotInput {
            hwnd,
            max_depth: max_depth.unwrap_or(10),
            max_elements: max_elements.unwrap_or(150),
        };
        let store = store.inner().clone();
        let timeout_ms = windows_impl::snapshot_timeout_ms(&store, hwnd);
        let process_id = windows_impl::process_id_for_hwnd_command(hwnd);
        let store_for_worker = store.clone();

        let outcome = run(Duration::from_millis(timeout_ms), move |ctx| {
            let (session, arenas, deadline) = ctx.resources()?;
            windows_impl::snapshot_impl(session, arenas, &store_for_worker, input, deadline)
        })
        .await;

        return match outcome {
            WorkerOutcome::Ok(value) => {
                if let Some(process_id) = process_id {
                    store.clear_process_timeout(process_id);
                }
                Ok(value)
            }
            WorkerOutcome::Err(error) => Err(error),
            WorkerOutcome::TimedOut => {
                if let Some(process_id) = process_id {
                    store.mark_process_timeout(process_id);
                }
                Err(CommandError::new(
                    "snapshot_timeout",
                    "Accessibility snapshot timed out",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_find_element(
    store: State<'_, SnapshotStore>,
    hwnd: i64,
    name_contains: String,
    role: Option<String>,
    wait_ms: Option<u64>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        use super::types::FindElementInput;

        let wait_ms = wait_ms.unwrap_or(0).min(MAX_WAIT_MS);
        let input = FindElementInput {
            hwnd,
            name_contains,
            role,
            wait_ms,
        };
        let store = store.inner().clone();
        let process_id = windows_impl::process_id_for_hwnd_command(hwnd);
        let timeout_budget = TIMEOUT_FIND_MS.saturating_add(wait_ms);
        let store_for_worker = store.clone();

        let outcome = run(Duration::from_millis(timeout_budget), move |ctx| {
            let (session, _arenas, deadline) = ctx.resources()?;
            windows_impl::find_element_impl(session, &store_for_worker, input, deadline)
        })
        .await;

        return match outcome {
            WorkerOutcome::Ok(value) => {
                if let Some(process_id) = process_id {
                    store.clear_process_timeout(process_id);
                }
                Ok(value)
            }
            WorkerOutcome::Err(error) => Err(error),
            WorkerOutcome::TimedOut => {
                if let Some(process_id) = process_id {
                    store.mark_process_find_timeout(process_id);
                }
                Err(CommandError::new(
                    "find_element_timeout",
                    "Finding accessibility element timed out",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_expand_node(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_EXPAND_MS), move |ctx| {
            let (session, arenas, deadline) = ctx.resources()?;
            windows_impl::expand_node_impl(session, arenas, &store, &reference, deadline)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "expand_node_timeout",
            "Expanding accessibility node timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_click(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::click_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(outcome, "click_timeout", "Accessibility click timed out");
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_set_value(
    store: State<'_, SnapshotStore>,
    reference: String,
    text: String,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::set_value_impl(session, &store, &reference, &text)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "set_value_timeout",
            "Setting accessibility value timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_send_keys(
    store: State<'_, SnapshotStore>,
    hwnd: i64,
    text: String,
    reference: Option<String>,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::send_keys_impl(session, &store, hwnd, &text, reference.as_deref())
        })
        .await;
        return map_worker_outcome(
            outcome,
            "send_keys_timeout",
            "Accessibility send_keys timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_focus(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::focus_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(outcome, "focus_timeout", "Accessibility focus timed out");
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_get_value(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<GetValueResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::get_value_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "get_value_timeout",
            "Reading accessibility value timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_scroll_element(
    store: State<'_, SnapshotStore>,
    reference: String,
    direction: String,
    amount: Option<String>,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let amount = amount.unwrap_or_else(|| "small".to_string());
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::scroll_element_impl(session, &store, &reference, &direction, &amount)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "scroll_element_timeout",
            "Accessibility scroll timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_right_click_element(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::right_click_element_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "right_click_timeout",
            "Accessibility right-click timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}

#[tauri::command]
pub async fn accessibility_invoke_action(
    store: State<'_, SnapshotStore>,
    reference: String,
    action: String,
) -> Result<ActionResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::invoke_action_impl(session, &store, &reference, &action)
        })
        .await;
        return map_worker_outcome(
            outcome,
            "invoke_action_timeout",
            "Accessibility invoke_action timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    unsupported_platform()
}
