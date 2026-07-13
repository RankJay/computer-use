//! macOS Accessibility (`AXUIElement`) provider.

mod actions;
mod query;
mod resolve;
mod roles;
mod session;
mod tree_extract;

#[cfg(feature = "a11y-bench")]
pub use resolve::{resolve_reference_with_stats, ResolveStats};
pub use session::snapshot_timeout_ms;
#[cfg(feature = "a11y-bench")]
pub use session::{take_ax_ipc_calls, SnapshotStats};
#[cfg(feature = "a11y-bench")]
pub use snapshot_with_stats;
#[cfg(feature = "a11y-bench")]
pub use AxAccessibilitySession;

use std::collections::HashMap;
use std::time::Instant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::arena::{ElementArena, NodeRecord};
use super::outline::{
    emit_outline_from_arena, finalize_outline, format_record_line, stored_from_record, CT_TEXT,
};
use super::provider::{AccessibilityProvider, AccessibilitySession};
use super::state::{make_reference, parse_reference, SnapshotStore};
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult,
};

use actions::{
    click_impl, focus_impl, get_value_impl, invoke_action_impl, right_click_element_impl,
    scroll_element_impl, send_keys_impl, set_value_impl,
};
use query::{find_element_impl, query_impl, wait_impl};
use resolve::{mint_projected_element, resolve_element_hwnd, resolve_stored_element};
use session::{
    ax_selected_children, ax_selected_text, element_at_point, element_name, element_pid,
    element_role, element_value_text, focused_element, process_id_for_hwnd,
    AxSession as SessionInner,
};
use tree_extract::{fetch_tree, fetch_tree_from_element, project_element_allow_text};

pub fn snapshot_impl(
    session: &SessionInner,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    Ok(snapshot_with_stats(session, arenas, store, input, deadline)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn snapshot_with_stats(
    session: &SessionInner,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<(TextResult, session::SnapshotStats), CommandError> {
    let input = input.clamped();
    match input.reference.as_deref() {
        Some(reference) => snapshot_from_reference(
            session,
            arenas,
            store,
            reference,
            input.hwnd,
            input.max_depth,
            input.max_elements,
            deadline,
        ),
        None => {
            let hwnd = input.hwnd.ok_or_else(|| {
                CommandError::new(
                    ErrorCode::InvalidInput,
                    "accessibility_snapshot requires hwnd or reference",
                )
            })?;
            snapshot_from_hwnd(
                session,
                arenas,
                store,
                hwnd,
                input.max_depth,
                input.max_elements,
                deadline,
            )
        }
    }
}

fn snapshot_from_hwnd(
    session: &SessionInner,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    hwnd: WindowId,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, session::SnapshotStats), CommandError> {
    let process_id = process_id_for_hwnd(hwnd).ok_or_else(|| {
        CommandError::new(
            ErrorCode::SnapshotFailed,
            "Could not resolve process id for hwnd",
        )
    })?;

    if store.is_process_degraded(process_id) {
        return Err(CommandError::new(
            ErrorCode::TargetDegraded,
            "Target process is temporarily marked degraded after repeated timeouts",
        ));
    }

    let _ = store.is_first_process_touch(process_id);

    let extracted = fetch_tree(session, hwnd, max_depth, deadline)?;
    let generation = store.begin_generation(hwnd);
    let outline = emit_outline_from_arena(
        store,
        hwnd,
        generation,
        process_id,
        &extracted.nodes,
        0,
        max_depth,
        max_elements,
        false,
    );

    arenas.insert(
        hwnd,
        ElementArena {
            generation,
            process_id,
            nodes: extracted.nodes,
        },
    );

    Ok(finalize_outline(outline, generation, extracted.used_bfs))
}

#[allow(clippy::too_many_arguments)]
fn snapshot_from_reference(
    session: &SessionInner,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    reference: &str,
    hwnd_arg: Option<WindowId>,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, session::SnapshotStats), CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let (_index, ref_generation, ref_hwnd) = parse_reference(reference).ok_or_else(|| {
        CommandError::new(
            ErrorCode::InvalidReference,
            "Reference must look like e14@3:123456",
        )
    })?;
    if let Some(hwnd) = hwnd_arg {
        if hwnd != stored.hwnd || hwnd != ref_hwnd {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "hwnd does not match reference window",
            ));
        }
    }

    if store.is_process_degraded(stored.process_id) {
        return Err(CommandError::new(
            ErrorCode::TargetDegraded,
            "Target process is temporarily marked degraded after repeated timeouts",
        ));
    }

    if let Some(arena) = arenas.get(&stored.hwnd) {
        if arena.generation == ref_generation {
            if let Some(root_idx) = arena.find_by_runtime_id(&stored.runtime_id) {
                let generation = store.begin_generation(stored.hwnd);
                let outline = emit_outline_from_arena(
                    store,
                    stored.hwnd,
                    generation,
                    stored.process_id,
                    &arena.nodes,
                    root_idx,
                    max_depth,
                    max_elements,
                    true,
                );
                if let Some(arena_mut) = arenas.get_mut(&stored.hwnd) {
                    arena_mut.generation = generation;
                }
                return Ok(finalize_outline(outline, generation, false));
            }
        }
    }

    let element = resolve_stored_element(session, &stored)?;
    let extracted = fetch_tree_from_element(&element, max_depth, deadline)?;
    let generation = store.begin_generation(stored.hwnd);
    let outline = emit_outline_from_arena(
        store,
        stored.hwnd,
        generation,
        stored.process_id,
        &extracted.nodes,
        0,
        max_depth,
        max_elements,
        true,
    );
    arenas.insert(
        stored.hwnd,
        ElementArena {
            generation,
            process_id: stored.process_id,
            nodes: extracted.nodes,
        },
    );

    Ok(finalize_outline(outline, generation, extracted.used_bfs))
}

fn get_text_impl(
    session: &SessionInner,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    reference: &str,
) -> Result<GetTextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;

    if let Some(arena) = arenas.get(&stored.hwnd) {
        if let Some(root_idx) = arena.find_by_runtime_id(&stored.runtime_id) {
            let names = collect_text_names_from_arena(&arena.nodes, root_idx);
            if !names.is_empty() {
                return Ok(GetTextResult {
                    text: names.join("\n"),
                    method: "arena_text".to_string(),
                });
            }
            let node = &arena.nodes[root_idx];
            if node.control_type_raw == CT_TEXT && !node.name.trim().is_empty() {
                return Ok(GetTextResult {
                    text: node.name.clone(),
                    method: "arena_text".to_string(),
                });
            }
        }
    }

    let element = resolve_stored_element(session, &stored)?;
    if let Some(value) = element_value_text(&element) {
        if !value.trim().is_empty() {
            return Ok(GetTextResult {
                text: value,
                method: "ax_value".to_string(),
            });
        }
    }

    let name = element_name(&element);
    if !name.trim().is_empty() {
        return Ok(GetTextResult {
            text: name,
            method: "ax_title".to_string(),
        });
    }

    Ok(GetTextResult {
        text: String::new(),
        method: "empty".to_string(),
    })
}

fn inspect_impl(
    session: &SessionInner,
    store: &SnapshotStore,
    reference: &str,
) -> Result<InspectResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let record = project_element_allow_text(&element, None, 0, &[], &stored.runtime_id)
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::InspectFailed,
                "Could not project accessibility element",
            )
        })?;

    let mut patterns = Vec::new();
    let role = element_role(&element);
    if role.contains("Button") || role == "AXLink" || role == "AXMenuItem" {
        patterns.push("Invoke".to_string());
    }
    if element_value_text(&element).is_some()
        || matches!(
            role.as_str(),
            "AXTextField" | "AXTextArea" | "AXSearchField"
        )
    {
        patterns.push("Value".to_string());
    }
    if role == "AXCheckBox" || role == "AXRadioButton" {
        patterns.push("Toggle".to_string());
    }
    if !ax_selected_children(&element).is_empty() || ax_selected_text(&element).is_some() {
        patterns.push("Selection".to_string());
    }

    let role_label = record.role.clone().unwrap_or_else(|| "unknown".to_string());
    let rect_text = match record.rect {
        Some((l, t, r, b)) => format!("rect=({l},{t},{r},{b})"),
        None => "rect=none".to_string(),
    };
    let mut lines = vec![
        format!("ref={reference}"),
        format!("name=\"{}\"", record.name.replace('"', "'")),
        format!("role={role_label}"),
        format!(
            "automationId=\"{}\"",
            record.automation_id.replace('"', "'")
        ),
        format!("runtimeId={:?}", record.runtime_id),
        format!("enabled={}", record.enabled),
        format!("offscreen={}", record.offscreen),
        rect_text,
        format!("patterns={}", patterns.join(",")),
    ];
    if let Some(value) = &record.value {
        lines.push(format!("value=\"{}\"", value.replace('"', "'")));
    }

    Ok(InspectResult {
        text: lines.join("\n"),
        name: record.name,
        role: record.role,
        automation_id: record.automation_id,
        runtime_id: record.runtime_id,
        enabled: record.enabled,
        offscreen: record.offscreen,
        value: record.value,
        rect: record.rect,
        patterns,
    })
}

fn get_selection_impl(
    session: &SessionInner,
    store: &SnapshotStore,
    reference: &str,
) -> Result<TextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;

    if let Some(text) = ax_selected_text(&element) {
        if !text.is_empty() {
            return Ok(TextResult::plain(text, None));
        }
    }

    let selected = ax_selected_children(&element);
    if selected.is_empty() {
        return Err(CommandError::new(
            ErrorCode::SelectionUnavailable,
            "Selection is not available on this element",
        ));
    }

    let generation = store.begin_generation(stored.hwnd);
    let mut lines = Vec::new();
    let mut emitted = 0u32;
    for selected_element in selected {
        let Some(record) = project_element_allow_text(&selected_element, None, 0, &[], &[]) else {
            continue;
        };
        emitted = emitted.saturating_add(1);
        let item_ref = make_reference(emitted, generation, stored.hwnd);
        store.store_element(
            stored.hwnd,
            generation,
            item_ref.clone(),
            stored_from_record(stored.hwnd, stored.process_id, &record),
        );
        lines.push(format_record_line(&record, 0, &item_ref, Some("selected")));
    }

    Ok(TextResult {
        text: lines.join("\n"),
        generation: Some(generation),
        visited: Some(emitted),
        emitted: Some(emitted),
        truncated: None,
        truncation_reason: None,
    })
}

fn get_focused_impl(
    session: &SessionInner,
    store: &SnapshotStore,
    hwnd: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let element = focused_element(session)?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element_pid(&element);
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::FocusMismatch,
                "Focused element is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(&element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

fn element_at_point_impl(
    session: &SessionInner,
    store: &SnapshotStore,
    x: i32,
    y: i32,
    hwnd: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let element = element_at_point(session, x, y)?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element_pid(&element);
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::PointMismatch,
                "Element at point is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(&element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

fn collect_text_names_from_arena(nodes: &[NodeRecord], root_idx: usize) -> Vec<String> {
    let mut names = Vec::new();
    let mut stack = vec![root_idx];
    while let Some(idx) = stack.pop() {
        let Some(node) = nodes.get(idx) else {
            continue;
        };
        if node.control_type_raw == CT_TEXT && !node.name.trim().is_empty() && idx != root_idx {
            names.push(node.name.clone());
        }
        for &child in node.children.iter().rev() {
            stack.push(child as usize);
        }
    }
    names
}

pub struct AxProvider;

impl AccessibilityProvider for AxProvider {
    fn create_session(&self) -> Result<Box<dyn AccessibilitySession>, CommandError> {
        let inner = SessionInner::init_on_worker_thread().map_err(|error| {
            if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
                error
            } else {
                CommandError::new(ErrorCode::UiaInitFailed, error.message)
            }
        })?;
        Ok(Box::new(AxAccessibilitySession {
            inner,
            arenas: HashMap::new(),
        }))
    }

    fn process_id_for_window(&self, hwnd: WindowId) -> Option<u32> {
        process_id_for_hwnd(hwnd)
    }

    fn snapshot_timeout_ms(&self, store: &SnapshotStore, hwnd: WindowId) -> u64 {
        snapshot_timeout_ms(store, hwnd)
    }
}

pub struct AxAccessibilitySession {
    pub(crate) inner: SessionInner,
    pub(crate) arenas: HashMap<WindowId, ElementArena>,
}

// SAFETY: Lives only on the a11y worker thread; AX handles never crossed.
unsafe impl Send for AxAccessibilitySession {}

impl AccessibilitySession for AxAccessibilitySession {
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }

    fn snapshot(
        &mut self,
        store: &SnapshotStore,
        input: SnapshotInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        snapshot_impl(&self.inner, &mut self.arenas, store, input, deadline)
    }

    fn find_element(
        &mut self,
        store: &SnapshotStore,
        input: FindElementInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        find_element_impl(&self.inner, &self.arenas, store, input, deadline)
    }

    fn query(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        query_impl(&self.inner, &self.arenas, store, input, deadline)
    }

    fn wait(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        wait_impl(&self.inner, &self.arenas, store, input, deadline)
    }

    fn get_text(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<GetTextResult, CommandError> {
        get_text_impl(&self.inner, &self.arenas, store, reference)
    }

    fn get_focused(
        &mut self,
        store: &SnapshotStore,
        hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError> {
        get_focused_impl(&self.inner, store, hwnd)
    }

    fn element_at_point(
        &mut self,
        store: &SnapshotStore,
        x: i32,
        y: i32,
        hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError> {
        element_at_point_impl(&self.inner, store, x, y, hwnd)
    }

    fn inspect(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<InspectResult, CommandError> {
        inspect_impl(&self.inner, store, reference)
    }

    fn get_selection(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<TextResult, CommandError> {
        get_selection_impl(&self.inner, store, reference)
    }

    fn click(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError> {
        click_impl(&self.inner, store, reference)
    }

    fn set_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        text: &str,
    ) -> Result<ActionResult, CommandError> {
        set_value_impl(&self.inner, store, reference, text)
    }

    fn send_keys(
        &mut self,
        store: &SnapshotStore,
        hwnd: WindowId,
        text: &str,
        reference: Option<&str>,
    ) -> Result<ActionResult, CommandError> {
        send_keys_impl(&self.inner, store, hwnd, text, reference)
    }

    fn focus(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError> {
        focus_impl(&self.inner, store, reference)
    }

    fn get_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<GetValueResult, CommandError> {
        get_value_impl(&self.inner, store, reference)
    }

    fn scroll_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        direction: &str,
        amount: &str,
    ) -> Result<ActionResult, CommandError> {
        scroll_element_impl(&self.inner, store, reference, direction, amount)
    }

    fn right_click_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError> {
        right_click_element_impl(&self.inner, store, reference)
    }

    fn invoke_action(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        action: &str,
    ) -> Result<ActionResult, CommandError> {
        invoke_action_impl(&self.inner, store, reference, action)
    }
}
