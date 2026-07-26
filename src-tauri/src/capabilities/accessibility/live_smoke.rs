//! Helpers for live-desktop smoke tests (no Tauri `State`).

use std::time::Duration;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::state::SnapshotStore;
use super::types::{
    ActionResult, InspectResult, QueryInput, SnapshotInput, TextResult, TIMEOUT_ACTION_MS,
    TIMEOUT_SNAPSHOT_MS,
};
use super::worker::{map_worker_outcome, run};

pub async fn snapshot(store: &SnapshotStore, hwnd: WindowId) -> Result<TextResult, CommandError> {
    let input = SnapshotInput {
        hwnd: Some(hwnd),
        reference: None,
        max_depth: 10,
        max_elements: 150,
    };
    let store = store.clone();
    map_worker_outcome(
        run(Duration::from_millis(TIMEOUT_SNAPSHOT_MS), move |ctx| {
            let deadline = ctx.deadline;
            let session = ctx.session_mut()?;
            session.snapshot(&store, input, deadline)
        })
        .await,
        ErrorCode::SnapshotTimeout,
        "Accessibility snapshot timed out",
    )
}

pub async fn query(
    store: &SnapshotStore,
    hwnd: WindowId,
    name_contains: &str,
    role: Option<&str>,
) -> Result<TextResult, CommandError> {
    let input = QueryInput {
        hwnd,
        name: None,
        name_contains: Some(name_contains.to_string()),
        automation_id: None,
        role: role.map(str::to_string),
        enabled: None,
        visible: None,
        limit: Some(5),
        wait_ms: 0,
        scope_reference: None,
    };
    let store = store.clone();
    // Short timeout for live smokes — avoid burning the full find budget.
    map_worker_outcome(
        run(Duration::from_millis(5_000), move |ctx| {
            let deadline = ctx.deadline;
            let session = ctx.session_mut()?;
            session.query(&store, input, deadline)
        })
        .await,
        ErrorCode::QueryTimeout,
        "Accessibility query timed out",
    )
}

pub async fn click(store: &SnapshotStore, reference: &str) -> Result<ActionResult, CommandError> {
    let store = store.clone();
    let reference = reference.to_string();
    map_worker_outcome(
        run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let deadline = ctx.deadline;
            let session = ctx.session_mut()?;
            session.click(&store, &reference, deadline)
        })
        .await,
        ErrorCode::ClickTimeout,
        "Accessibility click timed out",
    )
}

pub async fn element_at_point(
    store: &SnapshotStore,
    x: i32,
    y: i32,
    window_id: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let store = store.clone();
    map_worker_outcome(
        run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let session = ctx.session_mut()?;
            session.element_at_point(&store, x, y, window_id)
        })
        .await,
        ErrorCode::ElementAtPointTimeout,
        "Element-at-point lookup timed out",
    )
}

pub async fn inspect(
    store: &SnapshotStore,
    reference: &str,
) -> Result<InspectResult, CommandError> {
    let store = store.clone();
    let reference = reference.to_string();
    map_worker_outcome(
        run(Duration::from_millis(TIMEOUT_ACTION_MS), move |ctx| {
            let deadline = ctx.deadline;
            let session = ctx.session_mut()?;
            session.inspect(&store, &reference, deadline)
        })
        .await,
        ErrorCode::InspectTimeout,
        "Accessibility inspect timed out",
    )
}
