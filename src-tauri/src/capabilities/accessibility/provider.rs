//! Platform seam for accessibility automation.
//!
//! `create_session` must run on the a11y worker thread (COM/AX apartment affinity).

use std::any::Any;
use std::time::Instant;

use crate::capabilities::error::CommandError;
use crate::capabilities::window::WindowId;

use super::state::SnapshotStore;
use super::types::{
    ActionResult, FindElementInput, GetTextResult, GetValueResult, InspectResult, QueryInput,
    SnapshotInput, TextResult,
};

/// Session owned by the a11y worker thread (COM/AX affinity).
pub trait AccessibilitySession: Send {
    /// Downcast for adapters (e.g. a11y-bench stats helpers).
    #[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn snapshot(
        &mut self,
        store: &SnapshotStore,
        input: SnapshotInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError>;

    fn find_element(
        &mut self,
        store: &SnapshotStore,
        input: FindElementInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError>;

    fn query(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError>;

    fn wait(
        &mut self,
        store: &SnapshotStore,
        input: QueryInput,
        deadline: Instant,
    ) -> Result<TextResult, CommandError>;

    fn get_text(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<GetTextResult, CommandError>;

    fn get_focused(
        &mut self,
        store: &SnapshotStore,
        hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError>;

    fn element_at_point(
        &mut self,
        store: &SnapshotStore,
        x: i32,
        y: i32,
        hwnd: Option<WindowId>,
    ) -> Result<TextResult, CommandError>;

    fn inspect(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<InspectResult, CommandError>;

    fn get_selection(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<TextResult, CommandError>;

    fn click(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError>;

    fn set_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        text: &str,
    ) -> Result<ActionResult, CommandError>;

    fn send_keys(
        &mut self,
        store: &SnapshotStore,
        hwnd: WindowId,
        text: &str,
        reference: Option<&str>,
    ) -> Result<ActionResult, CommandError>;

    fn focus(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError>;

    fn get_value(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<GetValueResult, CommandError>;

    fn scroll_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        direction: &str,
        amount: &str,
    ) -> Result<ActionResult, CommandError>;

    fn right_click_element(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
    ) -> Result<ActionResult, CommandError>;

    fn invoke_action(
        &mut self,
        store: &SnapshotStore,
        reference: &str,
        action: &str,
    ) -> Result<ActionResult, CommandError>;
}

pub trait AccessibilityProvider: Send + Sync {
    /// Must run on the a11y worker thread (COM init + session construction).
    fn create_session(&self) -> Result<Box<dyn AccessibilitySession>, CommandError>;

    fn process_id_for_window(&self, hwnd: WindowId) -> Option<u32>;
    fn snapshot_timeout_ms(&self, store: &SnapshotStore, hwnd: WindowId) -> u64;
}
