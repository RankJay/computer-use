mod actions;
mod query;
mod resolve;
mod session;
mod tree_extract;

#[cfg_attr(not(feature = "a11y-bench"), allow(unused_imports))]
pub use resolve::resolve_reference_with_stats;
#[allow(unused_imports)] // public typed surface for a11y-bench callers
pub use resolve::ResolveStats;
#[cfg_attr(not(feature = "a11y-bench"), allow(unused_imports))]
pub use session::SnapshotStats;
pub use session::{snapshot_timeout_ms, UiaSession};

use std::collections::HashMap;
use std::time::Instant;

use uiautomation::core::UIElement;
use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::patterns::{
    UIExpandCollapsePattern, UIInvokePattern, UILegacyIAccessiblePattern, UIRangeValuePattern,
    UIScrollPattern, UISelectionItemPattern, UISelectionPattern, UITextPattern, UITogglePattern,
    UIValuePattern,
};
use uiautomation::types::{ControlType, Point, TreeScope, UIProperty};
use uiautomation::variants::Variant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::arena::{ElementArena, NodeRecord};
use super::outline::{
    emit_outline_from_arena, finalize_outline, format_record_line, stored_from_record,
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
use session::{element_control_type, element_name, map_uia_error, process_id_for_hwnd};
use tree_extract::{fetch_tree, fetch_tree_from_element, project_element_allow_text};

pub fn snapshot_impl(
    session: &UiaSession,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<TextResult, CommandError> {
    Ok(snapshot_with_stats(session, arenas, store, input, deadline)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn snapshot_with_stats(
    session: &UiaSession,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    input: SnapshotInput,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
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
    session: &UiaSession,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    hwnd: WindowId,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
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

#[allow(clippy::too_many_arguments)] // mirrors prior windows_impl signature
fn snapshot_from_reference(
    session: &UiaSession,
    arenas: &mut HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    reference: &str,
    hwnd_arg: Option<WindowId>,
    max_depth: u32,
    max_elements: u32,
    deadline: Instant,
) -> Result<(TextResult, SnapshotStats), CommandError> {
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
    let extracted = fetch_tree_from_element(session, &element, max_depth, deadline)?;
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

pub fn get_text_impl(
    session: &UiaSession,
    arenas: &HashMap<WindowId, ElementArena>,
    store: &SnapshotStore,
    reference: &str,
    _deadline: Instant,
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
            if node.control_type_raw == ControlType::Text as i32 && !node.name.trim().is_empty() {
                return Ok(GetTextResult {
                    text: node.name.clone(),
                    method: "arena_text".to_string(),
                });
            }
        }
    }

    let element = resolve_stored_element(session, &stored)?;

    if let Ok(pattern) = element.get_pattern::<UITextPattern>() {
        if let Ok(range) = pattern.get_document_range() {
            if let Ok(text) = range.get_text(-1) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Ok(GetTextResult {
                        text,
                        method: "text_pattern".to_string(),
                    });
                }
            }
        }
    }

    let names = collect_text_descendant_names(session, &element)?;
    if names.is_empty() {
        let own = element_name(&element);
        if !own.trim().is_empty()
            && element_control_type(&element)
                .ok()
                .is_some_and(|ct| ct == ControlType::Text)
        {
            return Ok(GetTextResult {
                text: own,
                method: "text_descendants".to_string(),
            });
        }
        return Ok(GetTextResult {
            text: String::new(),
            method: "empty".to_string(),
        });
    }

    Ok(GetTextResult {
        text: names.join("\n"),
        method: "text_descendants".to_string(),
    })
}

pub fn inspect_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
    _deadline: Instant,
) -> Result<InspectResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let record = project_element_allow_text(&element, None, 0, &[]).ok_or_else(|| {
        CommandError::new(
            ErrorCode::InspectFailed,
            "Could not project accessibility element",
        )
    })?;

    let mut patterns = Vec::new();
    if element.get_pattern::<UIInvokePattern>().is_ok() {
        patterns.push("Invoke".to_string());
    }
    if element.get_pattern::<UIValuePattern>().is_ok() {
        patterns.push("Value".to_string());
    }
    if element.get_pattern::<UITogglePattern>().is_ok() {
        patterns.push("Toggle".to_string());
    }
    if element.get_pattern::<UITextPattern>().is_ok() {
        patterns.push("Text".to_string());
    }
    if element.get_pattern::<UISelectionPattern>().is_ok() {
        patterns.push("Selection".to_string());
    }
    if element.get_pattern::<UISelectionItemPattern>().is_ok() {
        patterns.push("SelectionItem".to_string());
    }
    if element.get_pattern::<UIExpandCollapsePattern>().is_ok() {
        patterns.push("ExpandCollapse".to_string());
    }
    if element.get_pattern::<UILegacyIAccessiblePattern>().is_ok() {
        patterns.push("LegacyIAccessible".to_string());
    }
    if element.get_pattern::<UIScrollPattern>().is_ok() {
        patterns.push("Scroll".to_string());
    }
    if element.get_pattern::<UIRangeValuePattern>().is_ok() {
        patterns.push("RangeValue".to_string());
    }

    let role = record.role.clone().unwrap_or_else(|| "unknown".to_string());
    let rect_text = match record.rect {
        Some((l, t, r, b)) => format!("rect=({l},{t},{r},{b})"),
        None => "rect=none".to_string(),
    };
    let mut lines = vec![
        format!("ref={reference}"),
        format!("name=\"{}\"", record.name.replace('"', "'")),
        format!("role={role}"),
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

pub fn get_selection_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    reference: &str,
    _deadline: Instant,
) -> Result<TextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let element = resolve_stored_element(session, &stored)?;
    let pattern = element.get_pattern::<UISelectionPattern>().map_err(|_| {
        CommandError::new(
            ErrorCode::SelectionUnavailable,
            "Selection pattern is not available on this element",
        )
    })?;
    let selected = pattern
        .get_selection()
        .map_err(|error| map_uia_error(error, ErrorCode::GetSelectionFailed))?;

    let generation = store.begin_generation(stored.hwnd);
    let mut lines = Vec::new();
    let mut emitted = 0u32;
    for selected_element in selected {
        let Some(record) = project_element_allow_text(&selected_element, None, 0, &[]) else {
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

pub fn get_focused_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    hwnd: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let element = session
        .automation
        .get_focused_element_build_cache(&session.live_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::GetFocusedFailed))?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element.get_process_id().ok();
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::FocusMismatch,
                "Focused element is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(session, &element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

pub fn element_at_point_impl(
    session: &UiaSession,
    store: &SnapshotStore,
    x: i32,
    y: i32,
    hwnd: Option<WindowId>,
) -> Result<TextResult, CommandError> {
    let element = session
        .automation
        .element_from_point_build_cache(Point::new(x, y), &session.live_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::ElementAtPointFailed))?;

    if let Some(filter) = hwnd {
        let filter_pid = process_id_for_hwnd(filter);
        let elem_pid = element.get_process_id().ok();
        if filter_pid.is_none() || filter_pid != elem_pid {
            return Err(CommandError::new(
                ErrorCode::PointMismatch,
                "Element at point is not in the requested window",
            ));
        }
        return mint_projected_element(store, filter, &element);
    }

    let resolved_hwnd = resolve_element_hwnd(session, &element, None)?;
    mint_projected_element(store, resolved_hwnd, &element)
}

fn collect_text_descendant_names(
    session: &UiaSession,
    root: &UIElement,
) -> Result<Vec<String>, CommandError> {
    let condition = session
        .automation
        .create_property_condition(
            UIProperty::ControlType,
            Variant::from(ControlType::Text as i32),
            None,
        )
        .map_err(|error| map_uia_error(error, ErrorCode::GetTextFailed))?;

    let elements =
        match root.find_all_build_cache(TreeScope::Descendants, &condition, &session.subtree_cache)
        {
            Ok(elements) => elements,
            Err(error) if error.code() == ERR_NOTFOUND => Vec::new(),
            Err(error) => return Err(map_uia_error(error, ErrorCode::GetTextFailed)),
        };

    let mut names = Vec::new();
    for element in elements {
        let name = element_name(&element);
        if !name.trim().is_empty() {
            names.push(name);
        }
    }
    Ok(names)
}

fn collect_text_names_from_arena(nodes: &[NodeRecord], root_idx: usize) -> Vec<String> {
    let mut names = Vec::new();
    let mut stack = vec![root_idx];
    while let Some(idx) = stack.pop() {
        let Some(node) = nodes.get(idx) else {
            continue;
        };
        if node.control_type_raw == ControlType::Text as i32 && !node.name.trim().is_empty() {
            // Skip the root itself when collecting descendants; caller handles own Text.
            if idx != root_idx {
                names.push(node.name.clone());
            }
        }
        for &child in node.children.iter().rev() {
            stack.push(child as usize);
        }
    }
    // If root is a container, also include Text names found above.
    // If root itself is Text with a name and no descendants, caller uses own-name path.
    names
}

pub struct UiaProvider;

impl AccessibilityProvider for UiaProvider {
    fn create_session(&self) -> Result<Box<dyn AccessibilitySession>, CommandError> {
        // Must run on the a11y worker thread (COM apartment affinity).
        let hr = unsafe {
            windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            )
        };
        if hr.is_err() {
            return Err(CommandError::new(
                ErrorCode::UiaInitFailed,
                format!("CoInitializeEx failed: {hr:?}"),
            ));
        }
        let inner = UiaSession::init_on_worker_thread()?;
        Ok(Box::new(UiaAccessibilitySession {
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

pub struct UiaAccessibilitySession {
    pub(crate) inner: UiaSession,
    pub(crate) arenas: HashMap<WindowId, ElementArena>,
}

// SAFETY: Lives only on the a11y worker thread after COM init; never crossed.
unsafe impl Send for UiaAccessibilitySession {}

impl AccessibilitySession for UiaAccessibilitySession {
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
        deadline: Instant,
    ) -> Result<GetTextResult, CommandError> {
        get_text_impl(&self.inner, &self.arenas, store, reference, deadline)
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
        deadline: Instant,
    ) -> Result<InspectResult, CommandError> {
        inspect_impl(&self.inner, store, reference, deadline)
    }

    fn get_selection(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        get_selection_impl(&self.inner, store, reference, deadline)
    }

    fn click(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        click_impl(&self.inner, store, reference, deadline)
    }

    fn set_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        text: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        set_value_impl(&self.inner, store, reference, text, deadline)
    }

    fn send_keys(
        &mut self,
        store: &SnapshotStore,
        hwnd: WindowId,
        text: &str,
        reference: Option<&str>,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        send_keys_impl(&self.inner, store, hwnd, text, reference, deadline)
    }

    fn focus(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        focus_impl(&self.inner, store, reference, deadline)
    }

    fn get_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        deadline: Instant,
    ) -> Result<GetValueResult, CommandError> {
        get_value_impl(&self.inner, store, reference, deadline)
    }

    fn scroll_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        direction: &str,
        amount: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        scroll_element_impl(&self.inner, store, reference, direction, amount, deadline)
    }

    fn right_click_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        right_click_element_impl(&self.inner, store, reference, deadline)
    }

    fn invoke_action(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        action: &str,
        deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        invoke_action_impl(&self.inner, store, reference, action, deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uiautomation::types::ControlType;

    #[test]
    fn snapshot_input_clamps_bounds() {
        let input = SnapshotInput {
            hwnd: Some(WindowId(1)),
            reference: None,
            max_depth: 100,
            max_elements: 999,
        }
        .clamped();
        assert_eq!(input.max_depth, 20);
        assert_eq!(input.max_elements, 300);
    }

    #[test]
    fn arena_collects_text_descendant_names() {
        let nodes = vec![
            NodeRecord {
                parent: None,
                children: vec![1, 2],
                runtime_id: vec![1],
                automation_id: String::new(),
                name: "Dialog".to_string(),
                role: Some("Pane".to_string()),
                control_type_raw: ControlType::Pane as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec![],
                depth: 0,
            },
            NodeRecord {
                parent: Some(0),
                children: vec![],
                runtime_id: vec![2],
                automation_id: String::new(),
                name: "Are you sure?".to_string(),
                role: Some("Text".to_string()),
                control_type_raw: ControlType::Text as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec!["Pane:Dialog".to_string()],
                depth: 1,
            },
            NodeRecord {
                parent: Some(0),
                children: vec![],
                runtime_id: vec![3],
                automation_id: String::new(),
                name: "OK".to_string(),
                role: Some("Button".to_string()),
                control_type_raw: ControlType::Button as i32,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec!["Pane:Dialog".to_string()],
                depth: 1,
            },
        ];
        let names = collect_text_names_from_arena(&nodes, 0);
        assert_eq!(names, vec!["Are you sure?".to_string()]);
    }
}
