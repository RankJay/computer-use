//! In-memory accessibility session for unit tests.

use std::any::Any;
use std::collections::HashMap;
use std::time::Instant;

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::arena::ElementArena;
use super::outline::{emit_outline_from_arena, finalize_outline};
use super::provider::{AccessibilityProvider, AccessibilitySession};
use super::state::SnapshotStore;
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult, TIMEOUT_SNAPSHOT_MS,
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

    fn process_id_for_window(&self, _hwnd: WindowId) -> Option<u32> {
        Some(1)
    }

    fn snapshot_timeout_ms(&self, _store: &SnapshotStore, _hwnd: WindowId) -> u64 {
        TIMEOUT_SNAPSHOT_MS
    }
}

pub struct FakeSession {
    pub arenas: HashMap<WindowId, ElementArena>,
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
        _store: &SnapshotStore,
        _input: FindElementInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::FindFailed,
            "FakeSession does not implement find_element",
        ))
    }

    fn query(
        &mut self,
        _store: &SnapshotStore,
        _input: QueryInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::FindFailed,
            "FakeSession does not implement query",
        ))
    }

    fn wait(
        &mut self,
        _store: &SnapshotStore,
        _input: QueryInput,
        _deadline: Instant,
    ) -> Result<TextResult, CommandError> {
        Err(CommandError::new(
            ErrorCode::FindFailed,
            "FakeSession does not implement wait",
        ))
    }

    fn get_text(
        &mut self,
        _store: &SnapshotStore,
        _reference: &str,
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
    use crate::capabilities::accessibility::outline::CT_BUTTON;
    use crate::capabilities::accessibility::types::SnapshotInput;

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
}
