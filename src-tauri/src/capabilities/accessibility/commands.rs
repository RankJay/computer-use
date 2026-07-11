use std::time::Duration;

use tauri::State;

#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::{CommandError, ErrorCode};

use super::state::SnapshotStore;
use super::types::{
    ActionResult, GetTextResult, GetValueResult, InspectResult, TextResult, MAX_WAIT_MS,
    TIMEOUT_ACTION_MS, TIMEOUT_FIND_MS,
};
use super::worker::{map_worker_outcome, run, WorkerOutcome};

#[cfg(target_os = "windows")]
use super::windows_impl;

#[tauri::command]
pub async fn accessibility_snapshot(
    store: State<'_, SnapshotStore>,
    hwnd: Option<i64>,
    reference: Option<String>,
    max_depth: Option<u32>,
    max_elements: Option<u32>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        use super::types::SnapshotInput;

        if hwnd.is_none() && reference.is_none() {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "accessibility_snapshot requires hwnd or reference",
            ));
        }

        let input = SnapshotInput {
            hwnd,
            reference,
            max_depth: max_depth.unwrap_or(10),
            max_elements: max_elements.unwrap_or(150),
        };
        let store = store.inner().clone();
        let timeout_hwnd = hwnd.or_else(|| {
            input
                .reference
                .as_deref()
                .and_then(|r| store.resolve_ref(r).map(|e| e.hwnd))
        });
        let timeout_ms = timeout_hwnd
            .map(|h| windows_impl::snapshot_timeout_ms(&store, h))
            .unwrap_or(super::types::TIMEOUT_SNAPSHOT_MS);
        let process_id = timeout_hwnd.and_then(windows_impl::process_id_for_hwnd_command);
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
                    ErrorCode::SnapshotTimeout,
                    "Accessibility snapshot timed out",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (hwnd, reference, max_depth, max_elements);
        Err(unsupported_platform("Accessibility automation"))
    }
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
        let store = store.inner().clone();
        let process_id = windows_impl::process_id_for_hwnd_command(hwnd);
        let timeout_budget = TIMEOUT_FIND_MS.saturating_add(wait_ms);
        let store_for_worker = store.clone();

        let outcome = run(Duration::from_millis(timeout_budget), move |ctx| {
            let (session, arenas, deadline) = ctx.resources()?;
            windows_impl::find_element_impl(
                session,
                arenas,
                &store_for_worker,
                FindElementInput {
                    hwnd,
                    name_contains,
                    role,
                    wait_ms,
                },
                deadline,
            )
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
                    ErrorCode::FindElementTimeout,
                    "Finding accessibility element timed out",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
}

#[tauri::command]
pub async fn accessibility_query(
    store: State<'_, SnapshotStore>,
    hwnd: i64,
    name: Option<String>,
    name_contains: Option<String>,
    automation_id: Option<String>,
    role: Option<String>,
    enabled: Option<bool>,
    visible: Option<bool>,
    limit: Option<u32>,
    wait_ms: Option<u64>,
    scope_reference: Option<String>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        use super::types::QueryInput;

        let wait_ms = wait_ms.unwrap_or(0).min(MAX_WAIT_MS);
        let input = QueryInput {
            hwnd,
            name,
            name_contains,
            automation_id,
            role,
            enabled,
            visible,
            limit,
            wait_ms,
            scope_reference,
        }
        .clamped();
        let store = store.inner().clone();
        let process_id = windows_impl::process_id_for_hwnd_command(hwnd);
        let timeout_budget = TIMEOUT_FIND_MS.saturating_add(wait_ms);
        let store_for_worker = store.clone();

        let outcome = run(Duration::from_millis(timeout_budget), move |ctx| {
            let (session, arenas, deadline) = ctx.resources()?;
            windows_impl::query_impl(session, arenas, &store_for_worker, input, deadline)
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
                    ErrorCode::QueryTimeout,
                    "Accessibility query timed out",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (
            hwnd,
            name,
            name_contains,
            automation_id,
            role,
            enabled,
            visible,
            limit,
            wait_ms,
            scope_reference,
        );
        Err(unsupported_platform("Accessibility automation"))
    }
}

#[tauri::command]
pub async fn accessibility_wait(
    store: State<'_, SnapshotStore>,
    hwnd: i64,
    name: Option<String>,
    name_contains: Option<String>,
    automation_id: Option<String>,
    role: Option<String>,
    enabled: Option<bool>,
    visible: Option<bool>,
    limit: Option<u32>,
    timeout_ms: Option<u64>,
    scope_reference: Option<String>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        use super::types::QueryInput;

        let timeout_ms = timeout_ms.unwrap_or(5_000).min(MAX_WAIT_MS).max(1);
        let input = QueryInput {
            hwnd,
            name,
            name_contains,
            automation_id,
            role,
            enabled,
            visible,
            limit,
            wait_ms: timeout_ms,
            scope_reference,
        }
        .clamped();
        let store = store.inner().clone();
        let process_id = windows_impl::process_id_for_hwnd_command(hwnd);
        let store_for_worker = store.clone();

        let outcome = run(Duration::from_millis(timeout_ms), move |ctx| {
            let (session, arenas, deadline) = ctx.resources()?;
            windows_impl::wait_impl(session, arenas, &store_for_worker, input, deadline)
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
                    ErrorCode::WaitTimeout,
                    "Timed out waiting for accessibility query match",
                ))
            }
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (
            hwnd,
            name,
            name_contains,
            automation_id,
            role,
            enabled,
            visible,
            limit,
            timeout_ms,
            scope_reference,
        );
        Err(unsupported_platform("Accessibility automation"))
    }
}

#[tauri::command]
pub async fn accessibility_get_text(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<GetTextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let (session, arenas, _deadline) = ctx.resources()?;
            windows_impl::get_text_impl(session, arenas, &store, &reference)
        })
        .await;
        return map_worker_outcome(
            outcome,
            ErrorCode::GetTextTimeout,
            "Reading accessibility text timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
}

#[tauri::command]
pub async fn accessibility_get_focused(
    store: State<'_, SnapshotStore>,
    hwnd: Option<i64>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::get_focused_impl(session, &store, hwnd)
        })
        .await;
        return map_worker_outcome(
            outcome,
            ErrorCode::GetFocusedTimeout,
            "Getting focused accessibility element timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = hwnd;
        Err(unsupported_platform("Accessibility automation"))
    }
}

#[tauri::command]
pub async fn accessibility_element_at_point(
    store: State<'_, SnapshotStore>,
    x: i32,
    y: i32,
    hwnd: Option<i64>,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::element_at_point_impl(session, &store, x, y, hwnd)
        })
        .await;
        return map_worker_outcome(
            outcome,
            ErrorCode::ElementAtPointTimeout,
            "Element-at-point lookup timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (x, y, hwnd);
        Err(unsupported_platform("Accessibility automation"))
    }
}

#[tauri::command]
pub async fn accessibility_inspect(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<InspectResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::inspect_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(
            outcome,
            ErrorCode::InspectTimeout,
            "Accessibility inspect timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
}

#[tauri::command]
pub async fn accessibility_get_selection(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<TextResult, CommandError> {
    #[cfg(target_os = "windows")]
    {
        let store = store.inner().clone();
        let outcome = run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session()?;
            windows_impl::get_selection_impl(session, &store, &reference)
        })
        .await;
        return map_worker_outcome(
            outcome,
            ErrorCode::GetSelectionTimeout,
            "Reading accessibility selection timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
        return map_worker_outcome(
            outcome,
            ErrorCode::ClickTimeout,
            "Accessibility click timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::SetValueTimeout,
            "Setting accessibility value timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::SendKeysTimeout,
            "Accessibility send_keys timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
        return map_worker_outcome(
            outcome,
            ErrorCode::FocusTimeout,
            "Accessibility focus timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::GetValueTimeout,
            "Reading accessibility value timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::ScrollElementTimeout,
            "Accessibility scroll timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::RightClickTimeout,
            "Accessibility right-click timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
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
            ErrorCode::InvokeActionTimeout,
            "Accessibility invoke_action timed out",
        );
    }

    #[cfg(not(target_os = "windows"))]
    Err(unsupported_platform("Accessibility automation"))
}
