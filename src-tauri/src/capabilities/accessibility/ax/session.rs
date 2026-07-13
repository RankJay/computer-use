//! AX session helpers: window scoping, attribute reads, permission checks.

use std::ptr::NonNull;

use libc::pid_t;
use objc2_application_services::AXUIElement;
use objc2_core_foundation::{CFRetained, CFString, CFType};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::shared::macos_ax::{
    activate_app, ax_copy_array, ax_copy_attributes, ax_copy_bool, ax_copy_element, ax_copy_point,
    ax_copy_size, ax_copy_string, ax_perform, ax_uielement_get_window, ax_window_for_cg,
    map_ax_error, require_accessibility, set_ax_bool, set_ax_value, slot_bool, slot_element,
    slot_element_array, slot_point, slot_size, slot_string, AX_CHILDREN, AX_DESCRIPTION,
    AX_ENABLED, AX_FOCUSED, AX_FOCUSED_UI_ELEMENT, AX_IDENTIFIER, AX_PARENT, AX_POSITION, AX_PRESS,
    AX_RAISE, AX_ROLE, AX_SELECTED_CHILDREN, AX_SELECTED_TEXT, AX_SHOW_MENU, AX_SIZE, AX_TITLE,
    AX_VALUE,
};
pub(super) use crate::capabilities::shared::macos_ax::{lookup_cg_window, CgWindowInfo};
use crate::capabilities::window::WindowId;

use super::super::state::SnapshotStore;
use super::super::types;

pub use super::super::outline::SnapshotStats;

#[cfg(feature = "a11y-bench")]
pub use crate::capabilities::shared::macos_ax::take_ax_ipc_calls;

pub(super) const RESOLVE_RETRY_ATTEMPTS: u32 = 3;
pub(super) const TRANSIENT_AX_RETRY_MS: u64 = 120;

/// Projection / BFS attribute set — one IPC via [`ax_copy_attributes`].
const NODE_ATTRS: &[&str] = &[
    AX_ROLE,
    AX_TITLE,
    AX_DESCRIPTION,
    AX_IDENTIFIER,
    AX_ENABLED,
    AX_POSITION,
    AX_SIZE,
    AX_VALUE,
    AX_CHILDREN,
];

pub struct AxSession {
    pub system_wide: CFRetained<AXUIElement>,
}

impl AxSession {
    /// Build the long-lived session on the a11y worker thread (AX affinity).
    pub fn init_on_worker_thread() -> Result<Self, CommandError> {
        require_accessibility()?;
        let system_wide = unsafe { AXUIElement::new_system_wide() };
        // Soft timeout so hung apps don't stall the worker indefinitely.
        let _ = unsafe { system_wide.set_messaging_timeout(1.5) };
        Ok(Self { system_wide })
    }
}

pub(super) fn process_id_for_hwnd(hwnd: WindowId) -> Option<u32> {
    lookup_cg_window(hwnd).ok().map(|info| info.pid)
}

pub fn snapshot_timeout_ms(store: &SnapshotStore, hwnd: WindowId) -> u64 {
    if let Some(process_id) = process_id_for_hwnd(hwnd) {
        if !store.was_process_touched(process_id) {
            return types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS;
        }
    }
    types::TIMEOUT_SNAPSHOT_MS
}

/// Id-based entry: lookup then AX resolve. Prefer [`ax_window_for_info`] when
/// the caller already holds a `CgWindowInfo`.
#[allow(dead_code)]
pub(super) fn ax_window_for_hwnd(hwnd: WindowId) -> Result<CFRetained<AXUIElement>, CommandError> {
    let info = lookup_cg_window(hwnd)?;
    ax_window_for_info(&info)
}

/// Resolve AX window from a already-looked-up `CgWindowInfo`.
pub(super) fn ax_window_for_info(
    info: &CgWindowInfo,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    require_accessibility()?;
    ax_window_or_app_root(info)
}

/// Strict resolve, then app-root fallback when the CG window has no AX twin.
fn ax_window_or_app_root(info: &CgWindowInfo) -> Result<CFRetained<AXUIElement>, CommandError> {
    match ax_window_for_cg(info) {
        Ok(window) => Ok(window),
        Err(error) if error.code == ErrorCode::InvalidHwnd.as_str() => {
            let app = unsafe { AXUIElement::new_application(info.pid as pid_t) };
            let _ = unsafe { app.set_messaging_timeout(1.5) };
            Ok(app)
        }
        Err(error) => Err(error),
    }
}

pub(super) fn foreground_window(info: &CgWindowInfo) -> Result<bool, CommandError> {
    activate_app(info.pid)?;
    if let Ok(window) = ax_window_or_app_root(info) {
        let _ = ax_perform(&window, AX_RAISE);
    }
    Ok(true)
}

pub(super) fn element_role(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_ROLE).unwrap_or_default()
}

pub(super) fn element_name(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_TITLE)
        .or_else(|_| ax_copy_string(element, AX_DESCRIPTION))
        .unwrap_or_default()
}

pub(super) fn element_automation_id(element: &AXUIElement) -> String {
    ax_copy_string(element, AX_IDENTIFIER).unwrap_or_default()
}

pub(super) fn element_value_text(element: &AXUIElement) -> Option<String> {
    ax_copy_string(element, AX_VALUE)
        .ok()
        .filter(|v| is_useful_value(v))
}

pub(super) fn element_is_enabled(element: &AXUIElement) -> bool {
    ax_copy_bool(element, AX_ENABLED).unwrap_or(true)
}

pub(super) fn element_rect(element: &AXUIElement) -> Option<(i32, i32, i32, i32)> {
    let pos = ax_copy_point(element, AX_POSITION)?;
    let size = ax_copy_size(element, AX_SIZE)?;
    let left = pos.x.round() as i32;
    let top = pos.y.round() as i32;
    let right = left + size.width.round() as i32;
    let bottom = top + size.height.round() as i32;
    Some((left, top, right, bottom))
}

pub(super) fn element_children(element: &AXUIElement) -> Vec<CFRetained<AXUIElement>> {
    ax_copy_array(element, AX_CHILDREN)
        .map(|arr| arr.iter().collect())
        .unwrap_or_default()
}

/// Batched attributes for one AX node (tree walk / fingerprint scan).
pub(super) struct NodeAttrs {
    pub role: String,
    pub name: String,
    pub automation_id: String,
    pub enabled: bool,
    pub rect: Option<(i32, i32, i32, i32)>,
    pub value: Option<String>,
    pub children: Vec<CFRetained<AXUIElement>>,
}

/// One IPC for the projection attribute set; falls back to singles if batch fails.
pub(super) fn element_node_attrs(element: &AXUIElement) -> NodeAttrs {
    match ax_copy_attributes(element, NODE_ATTRS) {
        Ok(slots) if slots.len() == NODE_ATTRS.len() => node_attrs_from_slots(slots),
        _ => element_node_attrs_fallback(element),
    }
}

fn element_node_attrs_fallback(element: &AXUIElement) -> NodeAttrs {
    NodeAttrs {
        role: element_role(element),
        name: element_name(element),
        automation_id: element_automation_id(element),
        enabled: element_is_enabled(element),
        rect: element_rect(element),
        value: element_value_text(element),
        children: element_children(element),
    }
}

fn node_attrs_from_slots(mut slots: Vec<Option<CFRetained<CFType>>>) -> NodeAttrs {
    // Indices match NODE_ATTRS.
    let children_slot = slots.pop().flatten();
    let value_slot = slots.pop().flatten();
    let size_slot = slots.pop().flatten();
    let position_slot = slots.pop().flatten();
    let enabled_slot = slots.pop().flatten();
    let identifier_slot = slots.pop().flatten();
    let description_slot = slots.pop().flatten();
    let title_slot = slots.pop().flatten();
    let role_slot = slots.pop().flatten();

    let role = slot_string(role_slot).unwrap_or_default();
    let name = slot_string(title_slot)
        .or_else(|| slot_string(description_slot))
        .unwrap_or_default();
    let automation_id = slot_string(identifier_slot).unwrap_or_default();
    let enabled = slot_bool(enabled_slot).unwrap_or(true);
    let rect = match (slot_point(position_slot), slot_size(size_slot)) {
        (Some(pos), Some(size)) => {
            let left = pos.x.round() as i32;
            let top = pos.y.round() as i32;
            let right = left + size.width.round() as i32;
            let bottom = top + size.height.round() as i32;
            Some((left, top, right, bottom))
        }
        _ => None,
    };
    let value = slot_string(value_slot).filter(|v| is_useful_value(v));
    let children = slot_element_array(children_slot).unwrap_or_default();

    NodeAttrs {
        role,
        name,
        automation_id,
        enabled,
        rect,
        value,
        children,
    }
}

/// One hop of ancestor labeling: role/name of `element`, plus its parent for the next hop.
pub(super) fn element_ancestor_hop(
    element: &AXUIElement,
) -> (String, String, Option<CFRetained<AXUIElement>>) {
    const ATTRS: &[&str] = &[AX_PARENT, AX_ROLE, AX_TITLE, AX_DESCRIPTION];
    match ax_copy_attributes(element, ATTRS) {
        Ok(mut slots) if slots.len() == ATTRS.len() => {
            let description_slot = slots.pop().flatten();
            let title_slot = slots.pop().flatten();
            let role_slot = slots.pop().flatten();
            let parent_slot = slots.pop().flatten();
            let parent = slot_element(parent_slot);
            let role = slot_string(role_slot).unwrap_or_default();
            let name = slot_string(title_slot)
                .or_else(|| slot_string(description_slot))
                .unwrap_or_default();
            (role, name, parent)
        }
        _ => (
            element_role(element),
            element_name(element),
            element_parent(element),
        ),
    }
}

pub(super) fn element_parent(element: &AXUIElement) -> Option<CFRetained<AXUIElement>> {
    ax_copy_element(element, AX_PARENT).ok()
}

pub(super) fn set_focused(element: &AXUIElement) -> Result<(), CommandError> {
    set_ax_bool(element, AX_FOCUSED, true)
}

pub(super) fn set_value_string(element: &AXUIElement, text: &str) -> Result<(), CommandError> {
    let value = CFString::from_str(text);
    set_ax_value(element, AX_VALUE, &value)
}

pub(super) fn ax_press(element: &AXUIElement) -> Result<(), CommandError> {
    ax_perform(element, AX_PRESS)
}

pub(super) fn ax_show_menu(element: &AXUIElement) -> Result<(), CommandError> {
    ax_perform(element, AX_SHOW_MENU)
}

pub(super) fn ax_selected_text(element: &AXUIElement) -> Option<String> {
    ax_copy_string(element, AX_SELECTED_TEXT).ok()
}

pub(super) fn ax_selected_children(element: &AXUIElement) -> Vec<CFRetained<AXUIElement>> {
    ax_copy_array(element, AX_SELECTED_CHILDREN)
        .map(|arr| arr.iter().collect())
        .unwrap_or_default()
}

pub(super) fn focused_element(
    session: &AxSession,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    ax_copy_element(&session.system_wide, AX_FOCUSED_UI_ELEMENT).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str() {
            error
        } else {
            CommandError::new(ErrorCode::GetFocusedFailed, error.message)
        }
    })
}

pub(super) fn element_at_point(
    session: &AxSession,
    x: i32,
    y: i32,
) -> Result<CFRetained<AXUIElement>, CommandError> {
    let mut value: *const AXUIElement = std::ptr::null();
    let err = unsafe {
        session
            .system_wide
            .copy_element_at_position(x as f32, y as f32, NonNull::from(&mut value))
    };
    map_ax_error(err, "element_at_point")?;
    let Some(ptr) = NonNull::new(value.cast_mut()) else {
        return Err(CommandError::new(
            ErrorCode::ElementAtPointFailed,
            "No accessibility element at point",
        ));
    };
    Ok(unsafe { CFRetained::from_raw(ptr) })
}

pub(super) fn element_pid(element: &AXUIElement) -> Option<u32> {
    let mut pid: pid_t = 0;
    let err = unsafe { element.pid(NonNull::from(&mut pid)) };
    if err == objc2_application_services::AXError::Success && pid > 0 {
        Some(pid as u32)
    } else {
        None
    }
}

pub(super) fn element_cg_window_id(element: &AXUIElement) -> Option<u32> {
    let mut current: CFRetained<AXUIElement> = CFRetained::from(element);
    for _ in 0..24 {
        let mut cg_id = 0u32;
        let err = unsafe { ax_uielement_get_window(&current, &mut cg_id) };
        if err == 0 && cg_id != 0 {
            return Some(cg_id);
        }
        match element_parent(&current) {
            Some(parent) => current = parent,
            None => break,
        }
    }
    None
}

pub(super) fn is_useful_value(value_text: &str) -> bool {
    !value_text.is_empty()
}

pub(super) fn is_transient_command_error(error: &CommandError) -> bool {
    let message = error.message.to_ascii_lowercase();
    message.contains("cannot complete") || message.contains("invalid ui element")
}
