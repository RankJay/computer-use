use crate::capabilities::error::{unsupported_platform, CommandError};
use crate::capabilities::window::WindowId;

use super::provider::{AccessibilityProvider, AccessibilitySession};
use super::state::SnapshotStore;
use super::types::TIMEOUT_SNAPSHOT_MS;

pub struct UnsupportedAccessibilityProvider;

impl AccessibilityProvider for UnsupportedAccessibilityProvider {
    fn create_session(&self) -> Result<Box<dyn AccessibilitySession>, CommandError> {
        Err(unsupported_platform("Accessibility automation"))
    }

    fn process_id_for_window(&self, _hwnd: WindowId) -> Option<u32> {
        None
    }

    fn snapshot_timeout_ms(&self, _store: &SnapshotStore, _hwnd: WindowId) -> u64 {
        TIMEOUT_SNAPSHOT_MS
    }
}
