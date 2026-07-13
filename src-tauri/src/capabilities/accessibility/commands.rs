use std::time::Duration;

use tauri::State;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::state::SnapshotStore;
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult, MAX_WAIT_MS, TIMEOUT_ACTION_MS, TIMEOUT_FIND_MS,
};
use super::worker::{map_worker_outcome, run, WorkerOutcome};

async fn run_action<T, F>(
    timeout_ms: u64,
    timeout_code: ErrorCode,
    timeout_msg: &str,
    work: F,
) -> Result<T, CommandError>
where
    T: Send + 'static,
    F: FnOnce(&mut super::worker::WorkerCtx) -> Result<T, CommandError> + Send + 'static,
{
    map_worker_outcome(
        run(Duration::from_millis(timeout_ms), work).await,
        timeout_code,
        timeout_msg,
    )
}

#[tauri::command]
pub async fn accessibility_snapshot(
    store: State<'_, SnapshotStore>,
    window_id: Option<WindowId>,
    reference: Option<String>,
    max_depth: Option<u32>,
    max_elements: Option<u32>,
) -> Result<TextResult, CommandError> {
    if window_id.is_none() && reference.is_none() {
        return Err(CommandError::new(
            ErrorCode::InvalidInput,
            "accessibility_snapshot requires windowId or reference",
        ));
    }

    let input = SnapshotInput {
        hwnd: window_id,
        reference,
        max_depth: max_depth.unwrap_or(10),
        max_elements: max_elements.unwrap_or(150),
    };
    let store = store.inner().clone();
    let timeout_hwnd = window_id.or_else(|| {
        input
            .reference
            .as_deref()
            .and_then(|r| store.resolve_ref(r).map(|e| e.hwnd))
    });
    let timeout_ms = timeout_hwnd
        .map(|h| super::provider().snapshot_timeout_ms(&store, h))
        .unwrap_or(super::types::TIMEOUT_SNAPSHOT_MS);
    let process_id = timeout_hwnd.and_then(|h| super::provider().process_id_for_window(h));
    let store_for_worker = store.clone();

    let outcome = run(Duration::from_millis(timeout_ms), move |ctx| {
        let deadline = ctx.deadline;
        let session = ctx.session_mut()?;
        session.snapshot(&store_for_worker, input, deadline)
    })
    .await;

    match outcome {
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
    }
}

#[tauri::command]
pub async fn accessibility_find_element(
    store: State<'_, SnapshotStore>,
    window_id: WindowId,
    name_contains: String,
    role: Option<String>,
    wait_ms: Option<u64>,
) -> Result<TextResult, CommandError> {
    let wait_ms = wait_ms.unwrap_or(0).min(MAX_WAIT_MS);
    let store = store.inner().clone();
    let process_id = super::provider().process_id_for_window(window_id);
    let timeout_budget = TIMEOUT_FIND_MS.saturating_add(wait_ms);
    let store_for_worker = store.clone();

    let outcome = run(Duration::from_millis(timeout_budget), move |ctx| {
        let deadline = ctx.deadline;
        let session = ctx.session_mut()?;
        session.find_element(
            &store_for_worker,
            FindElementInput {
                hwnd: window_id,
                name_contains,
                role,
                wait_ms,
            },
            deadline,
        )
    })
    .await;

    match outcome {
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
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // wire-stable Tauri command arity
pub async fn accessibility_query(
    store: State<'_, SnapshotStore>,
    window_id: WindowId,
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
    let wait_ms = wait_ms.unwrap_or(0).min(MAX_WAIT_MS);
    let input = QueryInput {
        hwnd: window_id,
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
    let process_id = super::provider().process_id_for_window(window_id);
    let timeout_budget = TIMEOUT_FIND_MS.saturating_add(wait_ms);
    let store_for_worker = store.clone();

    let outcome = run(Duration::from_millis(timeout_budget), move |ctx| {
        let deadline = ctx.deadline;
        let session = ctx.session_mut()?;
        session.query(&store_for_worker, input, deadline)
    })
    .await;

    match outcome {
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
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // wire-stable Tauri command arity
pub async fn accessibility_wait(
    store: State<'_, SnapshotStore>,
    window_id: WindowId,
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
    let timeout_ms = timeout_ms.unwrap_or(5_000).clamp(1, MAX_WAIT_MS);
    let input = QueryInput {
        hwnd: window_id,
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
    let process_id = super::provider().process_id_for_window(window_id);
    let store_for_worker = store.clone();

    let outcome = run(Duration::from_millis(timeout_ms), move |ctx| {
        let deadline = ctx.deadline;
        let session = ctx.session_mut()?;
        session.wait(&store_for_worker, input, deadline)
    })
    .await;

    match outcome {
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
    }
}

#[tauri::command]
pub async fn accessibility_get_text(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<GetTextResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::GetTextTimeout,
        "Reading accessibility text timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.get_text(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_get_focused(
    store: State<'_, SnapshotStore>,
    window_id: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::GetFocusedTimeout,
        "Getting focused accessibility element timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.get_focused(&store, window_id)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_element_at_point(
    store: State<'_, SnapshotStore>,
    x: i32,
    y: i32,
    window_id: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::ElementAtPointTimeout,
        "Element-at-point lookup timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.element_at_point(&store, x, y, window_id)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_inspect(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<InspectResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::InspectTimeout,
        "Accessibility inspect timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.inspect(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_get_selection(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<TextResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::GetSelectionTimeout,
        "Reading accessibility selection timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.get_selection(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_click(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::ClickTimeout,
        "Accessibility click timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.click(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_set_value(
    store: State<'_, SnapshotStore>,
    reference: String,
    text: String,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::SetValueTimeout,
        "Setting accessibility value timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.set_value(&store, &reference, &text)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_send_keys(
    store: State<'_, SnapshotStore>,
    window_id: WindowId,
    text: String,
    reference: Option<String>,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::SendKeysTimeout,
        "Accessibility send_keys timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.send_keys(&store, window_id, &text, reference.as_deref())
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_focus(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::FocusTimeout,
        "Accessibility focus timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.focus(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_get_value(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<GetValueResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::GetValueTimeout,
        "Reading accessibility value timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.get_value(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_scroll_element(
    store: State<'_, SnapshotStore>,
    reference: String,
    direction: String,
    amount: Option<String>,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    let amount = amount.unwrap_or_else(|| "small".to_string());
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::ScrollElementTimeout,
        "Accessibility scroll timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.scroll_element(&store, &reference, &direction, &amount)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_right_click_element(
    store: State<'_, SnapshotStore>,
    reference: String,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::RightClickTimeout,
        "Accessibility right-click timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.right_click_element(&store, &reference)
        },
    )
    .await
}

#[tauri::command]
pub async fn accessibility_invoke_action(
    store: State<'_, SnapshotStore>,
    reference: String,
    action: String,
) -> Result<ActionResult, CommandError> {
    let store = store.inner().clone();
    run_action(
        TIMEOUT_ACTION_MS,
        ErrorCode::InvokeActionTimeout,
        "Accessibility invoke_action timed out",
        move |ctx| {
            let session = ctx.session_mut()?;
            session.invoke_action(&store, &reference, &action)
        },
    )
    .await
}
