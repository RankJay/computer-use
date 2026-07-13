//! In-memory accessibility session for unit tests.

use std::any::Any;
use std::collections::{HashMap, HashSet};
use std::time::Instant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::arena::ElementArena;
use super::outline::{
    emit_outline_from_arena, finalize_outline, format_record_line, stored_from_record,
};
use super::provider::{AccessibilityProvider, AccessibilitySession};
use super::query_match::{find_record_priority, parse_role_raw, select_query_matches};
use super::state::{make_reference, SnapshotStore};
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult, MAX_FIND_CANDIDATES, TIMEOUT_SNAPSHOT_MS,
};

pub struct FakeProvider {
    pub arenas: HashMap<WindowId, ElementArena>,
}

impl FakeProvider {
    pub fn with_arena(hwnd: WindowId, arena: ElementArena) -> Self {
        let mut arenas = HashMap::new();
        arenas.insert(hwnd, arena);
        Self { arenas }
    }
}

impl AccessibilityProvider for FakeProvider {
    fn create_session(&self) -> Result<Box<dyn AccessibilitySession>, CommandError> {
        Ok(Box::new(FakeSession {
            arenas: self.arenas.clone(),
        }))
    }

    fn process_id_for_window(&self, hwnd: WindowId) -> Option<u32> {
        self.arenas.get(&hwnd).map(|a| a.process_id)
    }

    fn snapshot_timeout_ms(&self, _store: &SnapshotStore, _hwnd: WindowId) -> u64 {
        TIMEOUT_SNAPSHOT_MS
    }
}

pub struct FakeSession {
    pub arenas: HashMap<WindowId, ElementArena>,
}

impl FakeSession {
    fn query_arena(
        &self,
        store: &SnapshotStore,
        input: QueryInput,
    ) -> Result<TextResult, CommandError> {
        let input = input.clamped();
        let arena = self
            .arenas
            .get(&input.hwnd)
            .ok_or_else(|| CommandError::new(ErrorCode::FindFailed, "No fake arena for hwnd"))?;

        if store.is_process_degraded(arena.process_id) {
            return Err(CommandError::new(
                ErrorCode::TargetDegraded,
                "Target process is temporarily marked degraded after repeated snapshot timeouts",
            ));
        }

        let name_exact = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_ascii_lowercase());
        let name_contains = input
            .name_contains
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_ascii_lowercase());
        let automation_id = input
            .automation_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let role_filter = input.role.as_deref().map(parse_role_raw).transpose()?;
        let limit = input.limit.unwrap_or(MAX_FIND_CANDIDATES as u32) as usize;

        if name_exact.is_none()
            && name_contains.is_none()
            && automation_id.is_none()
            && role_filter.is_none()
        {
            return Err(CommandError::new(
                ErrorCode::InvalidInput,
                "query requires at least one of name, nameContains, automationId, or role",
            ));
        }

        let scope_depth = input.scope_reference.as_deref().and_then(|scope_ref| {
            let stored = store.resolve_ref(scope_ref)?;
            let idx = arena.find_by_runtime_id(&stored.runtime_id)?;
            Some(arena.nodes[idx].depth)
        });

        let records: Vec<_> = arena
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, record)| {
                if let Some(enabled) = input.enabled {
                    if record.enabled != enabled {
                        return false;
                    }
                }
                if let Some(visible) = input.visible {
                    if record.offscreen == visible {
                        return false;
                    }
                }
                true
            })
            .map(|(order, record)| (order, record.clone()))
            .collect();

        let (tier, mut matches) = select_query_matches(
            &records,
            name_exact.as_deref(),
            name_contains.as_deref(),
            automation_id,
            role_filter,
        );
        matches.sort_by_key(|(order, record)| (find_record_priority(record, scope_depth), *order));

        let generation = store.begin_generation(input.hwnd);
        let mut lines = Vec::new();
        let mut seen_runtime = HashSet::new();
        let mut emitted = 0usize;
        for (_order, record) in matches {
            if emitted >= limit {
                break;
            }
            if !record.runtime_id.is_empty() && !seen_runtime.insert(record.runtime_id.clone()) {
                continue;
            }
            emitted += 1;
            let reference = make_reference(emitted as u32, generation, input.hwnd);
            store.store_element(
                input.hwnd,
                generation,
                reference.clone(),
                stored_from_record(input.hwnd, arena.process_id, &record),
            );
            lines.push(format_record_line(
                &record,
                0,
                &reference,
                Some(tier.label()),
            ));
        }

        Ok(TextResult {
            text: lines.join("\n"),
            generation: Some(generation),
            visited: Some(records.len() as u32),
            emitted: Some(emitted as u32),
            truncated: None,
            truncation_reason: None,
        })
    }
}

impl AccessibilitySession for FakeSession {
    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }

    fn snapshot(
        &mut self,
        store: &SnapshotStore,
        input: SnapshotInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        let input = input.clamped();
        let hwnd = input.hwnd.ok_or_else(|| {
            CommandError::new(
                ErrorCode::InvalidInput,
                "accessibility_snapshot requires hwnd or reference",
            )
        })?;
        let arena = self.arenas.get(&hwnd).ok_or_else(|| {
            CommandError::new(ErrorCode::SnapshotFailed, "No fake arena for hwnd")
        })?;
        if store.is_process_degraded(arena.process_id) {
            return Err(CommandError::new(
                ErrorCode::TargetDegraded,
                "Target process is temporarily marked degraded after repeated snapshot timeouts",
            ));
        }
        let generation = store.begin_generation(hwnd);
        let outline = emit_outline_from_arena(
            store,
            hwnd,
            generation,
            arena.process_id,
            &arena.nodes,
            0,
            input.max_depth,
            input.max_elements,
            false,
        );
        if let Some(arena_mut) = self.arenas.get_mut(&hwnd) {
            arena_mut.generation = generation;
        }
        Ok(finalize_outline(outline, generation, false).0)
    }

    fn find_element(
        &mut self,
        store: &SnapshotStore,
        input: FindElementInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        self.query_arena(store, QueryInput::from_find(input))
    }

    fn query(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        self.query_arena(store, input)
    }

    fn wait(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        let result = self.query_arena(store, input)?;
        if result.text.is_empty() {
            return Err(CommandError::new(
                ErrorCode::WaitTimeout,
                "Timed out waiting for accessibility query match",
            ));
        }
        Ok(result)
    }

    fn get_text(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<GetTextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::GetTextFailed,
            "FakeSession does not implement get_text",
        ))
    }

    fn get_focused(
        &mut self,
        _store: &SnapshotStore,
        _hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::GetFocusedFailed,
            "FakeSession does not implement get_focused",
        ))
    }

    fn element_at_point(
        &mut self,
        _store: &SnapshotStore,
        _x: i32,
        _y: i32,
        _hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ElementAtPointFailed,
            "FakeSession does not implement element_at_point",
        ))
    }

    fn inspect(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<InspectResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::InspectFailed,
            "FakeSession does not implement inspect",
        ))
    }

    fn get_selection(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::GetSelectionFailed,
            "FakeSession does not implement get_selection",
        ))
    }

    fn click(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ClickFailed,
            "FakeSession does not implement click",
        ))
    }

    fn set_value(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _text: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            "FakeSession does not implement set_value",
        ))
    }

    fn send_keys(
        &mut self,
        _store: &SnapshotStore,
        _hwnd: WindowId,
        _text: &str,
        _reference: Option<&str>,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            "FakeSession does not implement send_keys",
        ))
    }

    fn focus(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::FocusFailed,
            "FakeSession does not implement focus",
        ))
    }

    fn get_value(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<GetValueResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::GetValueFailed,
            "FakeSession does not implement get_value",
        ))
    }

    fn scroll_element(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _direction: &str,
        _amount: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            "FakeSession does not implement scroll_element",
        ))
    }

    fn right_click_element(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::ActionUnavailable,
            "FakeSession does not implement right_click_element",
        ))
    }

    fn invoke_action(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
        _action: &str,
        _deadline: Instant,
    ) -> Result<ActionResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::InvokeActionFailed,
            "FakeSession does not implement invoke_action",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::accessibility::arena::NodeRecord;
    use crate::capabilities::accessibility::outline::{CT_BUTTON, CT_PANE};
    use crate::capabilities::accessibility::types::SnapshotInput;

    fn dialog_arena() -> ElementArena {
        ElementArena {
            generation: 0,
            process_id: 77,
            nodes: vec![
                NodeRecord {
                    parent: None,
                    children: vec![1, 2],
                    runtime_id: vec![1],
                    automation_id: String::new(),
                    name: "Dialog".to_string(),
                    role: Some("Pane".to_string()),
                    control_type_raw: CT_PANE,
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
                    name: "OK".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: CT_BUTTON,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
                NodeRecord {
                    parent: Some(0),
                    children: vec![],
                    runtime_id: vec![3],
                    automation_id: String::new(),
                    name: "Cancel".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: CT_BUTTON,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
            ],
        }
    }

    #[test]
    fn fake_provider_snapshot_emits_outline() {
        let hwnd = WindowId(1);
        let arena = ElementArena {
            generation: 0,
            process_id: 9,
            nodes: vec![NodeRecord {
                parent: None,
                children: vec![],
                runtime_id: vec![1],
                automation_id: String::new(),
                name: "Go".to_string(),
                role: Some("Button".to_string()),
                control_type_raw: CT_BUTTON,
                enabled: true,
                offscreen: false,
                rect: None,
                value: None,
                ancestor_chain: vec![],
                depth: 0,
            }],
        };
        let provider = FakeProvider::with_arena(hwnd, arena);
        let mut session = provider.create_session().expect("session");
        let store = SnapshotStore::default();
        let result = session
            .snapshot(
                &store,
                SnapshotInput {
                    hwnd: Some(hwnd),
                    reference: None,
                    max_depth: 10,
                    max_elements: 150,
                },
                Instant::now(),
            )
            .expect("snapshot");
        assert!(result.text.contains("Button \"Go\""));
    }

    #[test]
    fn fake_query_by_name_and_role() {
        let hwnd = WindowId(42);
        let provider = FakeProvider::with_arena(hwnd, dialog_arena());
        let mut session = provider.create_session().expect("session");
        let store = SnapshotStore::default();
        let result = session
            .query(
                &store,
                QueryInput {
                    hwnd,
                    name: Some("ok".into()),
                    name_contains: None,
                    automation_id: None,
                    role: Some("button".into()),
                    enabled: None,
                    visible: None,
                    limit: Some(5),
                    wait_ms: 0,
                    scope_reference: None,
                },
                Instant::now(),
            )
            .expect("query");
        assert!(
            result.text.contains("Button \"OK\""),
            "query text:\n{}",
            result.text
        );
        assert!(result.text.contains("match=exact"));
        assert!(!result.text.contains("Cancel"));
    }

    #[test]
    fn two_snapshot_timeouts_degrade_query() {
        let hwnd = WindowId(42);
        let provider = FakeProvider::with_arena(hwnd, dialog_arena());
        assert_eq!(provider.process_id_for_window(hwnd), Some(77));
        let mut session = provider.create_session().expect("session");
        let store = SnapshotStore::default();
        store.mark_process_timeout(77);
        store.mark_process_timeout(77);
        let err = session
            .query(
                &store,
                QueryInput {
                    hwnd,
                    name: Some("ok".into()),
                    name_contains: None,
                    automation_id: None,
                    role: Some("button".into()),
                    enabled: None,
                    visible: None,
                    limit: Some(5),
                    wait_ms: 0,
                    scope_reference: None,
                },
                Instant::now(),
            )
            .expect_err("degraded");
        assert_eq!(err.code, "target_degraded");

        let snap_err = session
            .snapshot(
                &store,
                SnapshotInput {
                    hwnd: Some(hwnd),
                    reference: None,
                    max_depth: 10,
                    max_elements: 150,
                },
                Instant::now(),
            )
            .expect_err("degraded snapshot");
        assert_eq!(snap_err.code, "target_degraded");
    }

    #[test]
    fn find_timeout_does_not_degrade() {
        let hwnd = WindowId(42);
        let provider = FakeProvider::with_arena(hwnd, dialog_arena());
        let mut session = provider.create_session().expect("session");
        let store = SnapshotStore::default();
        store.mark_process_find_timeout(77);
        store.mark_process_find_timeout(77);
        let result = session
            .query(
                &store,
                QueryInput {
                    hwnd,
                    name: Some("cancel".into()),
                    name_contains: None,
                    automation_id: None,
                    role: None,
                    enabled: None,
                    visible: None,
                    limit: Some(5),
                    wait_ms: 0,
                    scope_reference: None,
                },
                Instant::now(),
            )
            .expect("query should succeed");
        assert!(result.text.contains("Cancel"));
    }

    #[test]
    fn wait_empty_is_timeout() {
        let hwnd = WindowId(42);
        let provider = FakeProvider::with_arena(hwnd, dialog_arena());
        let mut session = provider.create_session().expect("session");
        let store = SnapshotStore::default();
        let err = session
            .wait(
                &store,
                QueryInput {
                    hwnd,
                    name: Some("missing".into()),
                    name_contains: None,
                    automation_id: None,
                    role: None,
                    enabled: None,
                    visible: None,
                    limit: Some(5),
                    wait_ms: 0,
                    scope_reference: None,
                },
                Instant::now(),
            )
            .expect_err("wait");
        assert_eq!(err.code, "wait_timeout");
    }
}
