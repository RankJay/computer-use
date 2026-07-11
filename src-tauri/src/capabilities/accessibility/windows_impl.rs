use std::thread;
use std::time::Duration;

use uiautomation::controls::WindowControl;
use uiautomation::core::{UIAutomation, UIElement, UIMatcherMode};
use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::patterns::{
    UIExpandCollapsePattern, UIInvokePattern, UILegacyIAccessiblePattern, UIRangeValuePattern,
    UIScrollItemPattern, UIScrollPattern, UISelectionItemPattern, UITogglePattern, UIValuePattern,
    UIPatternType,
};
use uiautomation::types::{ControlType, Handle, ScrollAmount, TreeScope, UIProperty};
use uiautomation::variants::{Value, Variant};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

use crate::capabilities::path_utils::CommandError;

use super::budget::{SearchBudget, FIND_MAX_NODES, SNAPSHOT_MAX_NODES};
use super::state::{make_reference, SnapshotStore, StoredElement};
use super::types::{
    ActionResult, FindElementInput, GetValueResult, MAX_FIND_CANDIDATES, MAX_WAIT_MS, SnapshotInput,
    TextResult, WAIT_POLL_MS,
};

fn process_id_for_hwnd(hwnd: i64) -> Option<u32> {
    let handle = hwnd_from_i64(hwnd).ok()?;
    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(handle.into(), Some(&mut process_id));
    }
    if process_id == 0 {
        None
    } else {
        Some(process_id)
    }
}

pub fn snapshot_timeout_ms(store: &SnapshotStore, hwnd: i64) -> u64 {
    if let Some(process_id) = process_id_for_hwnd(hwnd) {
        if !store.was_process_touched(process_id) {
            return super::types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS;
        }
    }
    super::types::TIMEOUT_SNAPSHOT_MS
}

pub fn process_id_for_hwnd_command(hwnd: i64) -> Option<u32> {
    process_id_for_hwnd(hwnd)
}

const CONNECTION_TIMEOUT_MS: u32 = 500;
const TRANSACTION_TIMEOUT_MS: u32 = 1_500;
const FIND_WALK_MAX_DEPTH: u32 = 24;
const FIND_MATCHER_MAX_DEPTH: u32 = 32;
const MAX_SIBLING_REPEAT: u32 = 3;
const FIND_MAX_SIBLING_REPEAT: u32 = 64;
const RESOLVE_RETRY_ATTEMPTS: u32 = 3;
const TRANSIENT_UIA_RETRY_MS: u64 = 120;

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct SnapshotStats {
    pub nodes_visited: u32,
    pub emitted: u32,
}

pub fn snapshot_impl(
    store: &SnapshotStore,
    input: SnapshotInput,
) -> Result<TextResult, CommandError> {
    Ok(snapshot_with_stats(store, input)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn snapshot_with_stats(
    store: &SnapshotStore,
    input: SnapshotInput,
) -> Result<(TextResult, SnapshotStats), CommandError> {
    let session = UiaSession::new()?;
    let handle = hwnd_from_i64(input.hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.cache_request)
        .map_err(|error| map_uia_error(error, "snapshot_failed"))?;
    let process_id = root
        .get_process_id()
        .map_err(|error| map_uia_error(error, "snapshot_failed"))?;

    if store.is_process_degraded(process_id) {
        return Err(CommandError::new(
            "target_degraded",
            "Target process is temporarily marked degraded after repeated timeouts",
        ));
    }

    let budget_ms = if store.is_first_process_touch(process_id) {
        super::types::TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS
    } else {
        super::types::TIMEOUT_SNAPSHOT_MS
    };

    let generation = store.begin_generation(input.hwnd);
    let mut budget = SearchBudget::for_duration(Duration::from_millis(budget_ms), SNAPSHOT_MAX_NODES);
    let mut builder = OutlineBuilder::new(store, input.hwnd, generation, process_id, input.max_elements);
    builder.walk(
        &session,
        &root,
        0,
        input.max_depth,
        false,
        &mut budget,
    )?;

    let stats = SnapshotStats {
        nodes_visited: budget.nodes_visited(),
        emitted: builder.emitted,
    };
    Ok((
        TextResult {
            text: builder.finish(),
            generation: Some(generation),
        },
        stats,
    ))
}

pub fn find_element_impl(
    store: &SnapshotStore,
    input: FindElementInput,
) -> Result<TextResult, CommandError> {
    let wait_ms = input.wait_ms.min(MAX_WAIT_MS);
    let total_ms = super::types::TIMEOUT_FIND_MS.saturating_add(wait_ms);
    let deadline = std::time::Instant::now() + Duration::from_millis(total_ms);

    loop {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            return Ok(empty_find_result(store, input.hwnd));
        }

        match find_element_once(store, &input, deadline) {
            Ok(result) if !result.text.is_empty() => return Ok(result),
            Ok(result) if std::time::Instant::now() >= deadline => return Ok(result),
            Err(error) if error.code == "target_degraded" => return Err(error),
            Err(error) if std::time::Instant::now() >= deadline => return Err(error),
            Ok(_) | Err(_) => thread::sleep(Duration::from_millis(WAIT_POLL_MS.min(
                remaining.as_millis() as u64,
            ))),
        }
    }
}

fn empty_find_result(store: &SnapshotStore, hwnd: i64) -> TextResult {
    let generation = store.begin_generation(hwnd);
    TextResult {
        text: String::new(),
        generation: Some(generation),
    }
}

fn find_element_once(
    store: &SnapshotStore,
    input: &FindElementInput,
    deadline: std::time::Instant,
) -> Result<TextResult, CommandError> {
    let session = UiaSession::new()?;
    let handle = hwnd_from_i64(input.hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.cache_request)
        .map_err(|error| map_uia_error(error, "find_failed"))?;
    let process_id = root
        .get_process_id()
        .map_err(|error| map_uia_error(error, "find_failed"))?;

    if store.is_process_degraded(process_id) {
        return Err(CommandError::new(
            "target_degraded",
            "Target process is temporarily marked degraded after repeated snapshot timeouts",
        ));
    }

    let name_filter = input.name_contains.trim();
    if name_filter.is_empty() {
        return Err(CommandError::new(
            "invalid_input",
            "nameContains must not be empty",
        ));
    }

    let role_filter = input
        .role
        .as_deref()
        .map(parse_role)
        .transpose()?;

    let search_root = find_web_search_root(&session, &root);
    let mut matches = find_elements_via_matcher(
        &session,
        &search_root,
        name_filter,
        role_filter,
        deadline,
    )?;

    if matches.is_empty() && role_filter.is_some() {
        matches = find_elements_via_matcher(
            &session,
            &search_root,
            name_filter,
            None,
            deadline,
        )?;
    }

    if matches.is_empty() {
        let name_filter_lower = name_filter.to_lowercase();
        let mut budget = SearchBudget::until(deadline, FIND_MAX_NODES);
        let mut finder = ElementFinder::new(&name_filter_lower, role_filter);
        finder.search(&session, &search_root, 0, FIND_WALK_MAX_DEPTH, &mut budget)?;
        matches = finder.matches;
    }

    matches.sort_by_key(|element| find_candidate_priority(element));

    let generation = store.begin_generation(input.hwnd);
    let mut lines = Vec::new();
    for (index, element) in matches.into_iter().take(MAX_FIND_CANDIDATES).enumerate() {
        let reference = make_reference((index + 1) as u32, generation);
        let runtime_id =
            element_runtime_id(&element).map_err(|error| map_uia_error(error, "find_failed"))?;
        let (name, role) = element_storage_hints(&element);
        store.store_element(
            input.hwnd,
            generation,
            reference.clone(),
            runtime_id,
            process_id,
            name,
            role,
        );
        lines.push(format_element_line(&element, 0, &reference)?);
    }

    Ok(TextResult {
        text: lines.join("\n"),
        generation: Some(generation),
    })
}

fn find_web_search_root(session: &UiaSession, window: &UIElement) -> UIElement {
    for mode in [UIMatcherMode::Control, UIMatcherMode::Content] {
        let matcher = session
            .automation
            .create_matcher()
            .from(window.clone())
            .control_type(ControlType::Document)
            .mode(mode)
            .depth(12)
            .timeout(1_500)
            .interval(100);
        if let Ok(document) = matcher.find_first() {
            return document;
        }
    }
    window.clone()
}

fn find_elements_via_matcher(
    session: &UiaSession,
    root: &UIElement,
    name_filter: &str,
    role_filter: Option<ControlType>,
    deadline: std::time::Instant,
) -> Result<Vec<UIElement>, CommandError> {
    let remaining_ms = deadline
        .saturating_duration_since(std::time::Instant::now())
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    if remaining_ms == 0 {
        return Ok(Vec::new());
    }

    let mut collected = Vec::new();
    for mode in [UIMatcherMode::Control, UIMatcherMode::Content] {
        let mut matcher = session
            .automation
            .create_matcher()
            .from(root.clone())
            .contains_name(name_filter)
            .mode(mode)
            .depth(FIND_MATCHER_MAX_DEPTH)
            .timeout(remaining_ms)
            .interval(WAIT_POLL_MS);

        if let Some(role) = role_filter {
            matcher = matcher.control_type(role);
        }

        match matcher.find_all() {
            Ok(elements) => {
                collected.extend(elements);
                if collected.len() >= MAX_FIND_CANDIDATES {
                    break;
                }
            }
            Err(error) if matcher_error_is_empty(&error) => {}
            Err(error) => return Err(map_uia_error(error, "find_failed")),
        }
    }

    collected.sort_by_key(|element| find_candidate_priority(element));
    collected.truncate(MAX_FIND_CANDIDATES);
    Ok(collected)
}

fn matcher_error_is_empty(error: &uiautomation::Error) -> bool {
    error.code() == ERR_NOTFOUND
}

pub fn expand_node_impl(store: &SnapshotStore, reference: &str) -> Result<TextResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let generation = store.begin_generation(stored.hwnd);
    let mut builder = OutlineBuilder::new(store, stored.hwnd, generation, stored.process_id, 150);
    let mut budget = SearchBudget::for_duration(
        Duration::from_millis(super::types::TIMEOUT_EXPAND_MS),
        SNAPSHOT_MAX_NODES,
    );
    builder.walk(&session, &element, 0, 10, true, &mut budget)?;

    Ok(TextResult {
        text: builder.finish(),
        generation: Some(generation),
    })
}

pub fn click_impl(store: &SnapshotStore, reference: &str) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;
    let target = resolve_click_target(&session, &element)?;
    prepare_for_click(&target)?;

    let control_type = target
        .get_control_type()
        .unwrap_or(ControlType::Custom);

    if control_type == ControlType::Hyperlink {
        if let Some(result) = try_legacy_action(&target, foregrounded) {
            return result;
        }
        if let Some(result) = try_invoke(&target, foregrounded) {
            return result;
        }
        if let Some(result) = try_keyboard_enter(&target, foregrounded) {
            return result;
        }
    } else {
        if let Some(result) = try_invoke(&target, foregrounded) {
            return result;
        }
        if let Some(result) = try_toggle(&target, foregrounded) {
            return result;
        }
        if let Some(result) = try_legacy_action(&target, foregrounded) {
            return result;
        }
        if control_type == ControlType::ListItem {
            if let Some(result) = try_keyboard_enter(&target, foregrounded) {
                return result;
            }
        }
    }

    target
        .click()
        .map_err(|error| map_uia_error(error, "click_failed"))?;
    Ok(ActionResult {
        ok: true,
        method: "synthetic_click".to_string(),
        foregrounded,
    })
}

fn prepare_for_click(element: &UIElement) -> Result<(), CommandError> {
    if let Ok(pattern) = element.get_pattern::<UIScrollItemPattern>() {
        let _ = pattern.scroll_into_view();
    }
    let _ = element.set_focus();
    Ok(())
}

fn resolve_click_target(session: &UiaSession, element: &UIElement) -> Result<UIElement, CommandError> {
    let mut chain = vec![element.clone()];
    let mut current = element.clone();
    for _ in 0..8 {
        let walker = session
            .automation
            .get_control_view_walker()
            .map_err(|error| map_uia_error(error, "click_failed"))?;
        match walker.get_parent_build_cache(&current, &session.cache_request) {
            Ok(parent) => {
                chain.push(parent.clone());
                current = parent;
            }
            Err(_) => break,
        }
    }

    for node in &chain {
        if node.get_control_type() == Ok(ControlType::Hyperlink) {
            return Ok(node.clone());
        }
    }

    for node in &chain {
        if is_preferred_click_target(node) {
            return Ok(node.clone());
        }
    }

    Ok(element.clone())
}

fn is_preferred_click_target(element: &UIElement) -> bool {
    if let Ok(control_type) = element.get_control_type() {
        if matches!(
            control_type,
            ControlType::Button
                | ControlType::MenuItem
                | ControlType::SplitButton
                | ControlType::ListItem
                | ControlType::TabItem
        ) {
            return true;
        }
    }
    element.get_pattern::<UIInvokePattern>().is_ok()
        || element.get_pattern::<UILegacyIAccessiblePattern>().is_ok()
}

fn try_invoke(element: &UIElement, foregrounded: bool) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UIInvokePattern>().ok()?;
    match pattern.invoke() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "invoke".to_string(),
            foregrounded,
        })),
        Err(error) if is_transient_subscriber_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, "click_failed"))),
    }
}

fn try_toggle(element: &UIElement, foregrounded: bool) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UITogglePattern>().ok()?;
    match pattern.toggle() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "toggle".to_string(),
            foregrounded,
        })),
        Err(error) if is_transient_subscriber_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, "click_failed"))),
    }
}

fn try_legacy_action(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    let pattern = element.get_pattern::<UILegacyIAccessiblePattern>().ok()?;
    match pattern.do_default_action() {
        Ok(()) => Some(Ok(ActionResult {
            ok: true,
            method: "legacy".to_string(),
            foregrounded,
        })),
        Err(error) if is_transient_subscriber_error(&error) => None,
        Err(error) => Some(Err(map_uia_error(error, "click_failed"))),
    }
}

fn try_keyboard_enter(
    element: &UIElement,
    foregrounded: bool,
) -> Option<Result<ActionResult, CommandError>> {
    Some(
        element
            .set_focus()
            .and_then(|_| element.send_keys("{ENTER}", 10))
            .map(|_| ActionResult {
                ok: true,
                method: "enter".to_string(),
                foregrounded,
            })
            .map_err(|error| map_uia_error(error, "click_failed")),
    )
}

fn find_candidate_priority(element: &UIElement) -> (i32, i32) {
    let offscreen = if element.is_offscreen().ok() == Some(true) {
        1
    } else {
        0
    };
    let role = element
        .get_control_type()
        .map(|control_type| match control_type {
            ControlType::Hyperlink => 0,
            ControlType::Button => 1,
            ControlType::ListItem => 2,
            ControlType::MenuItem => 3,
            ControlType::TabItem => 4,
            ControlType::TreeItem => 5,
            ControlType::Edit => 6,
            ControlType::ComboBox => 7,
            ControlType::Group => 40,
            ControlType::Text => 50,
            ControlType::Image => 55,
            _ => 20,
        })
        .unwrap_or(30);
    (role, offscreen)
}

pub fn set_value_impl(
    store: &SnapshotStore,
    reference: &str,
    text: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;

    if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
        pattern
            .set_value(text)
            .map_err(|error| map_uia_error(error, "set_value_failed"))?;
        return Ok(ActionResult {
            ok: true,
            method: "value_pattern".to_string(),
            foregrounded,
        });
    }

    if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
        pattern
            .set_value(text)
            .map_err(|error| map_uia_error(error, "set_value_failed"))?;
        return Ok(ActionResult {
            ok: true,
            method: "legacy".to_string(),
            foregrounded,
        });
    }

    element
        .set_focus()
        .map_err(|error| map_uia_error(error, "set_value_failed"))?;
    element
        .send_keys(text, 10)
        .map_err(|error| map_uia_error(error, "set_value_failed"))?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

pub fn send_keys_impl(
    store: &SnapshotStore,
    hwnd: i64,
    text: &str,
    reference: Option<&str>,
) -> Result<ActionResult, CommandError> {
    if text.is_empty() {
        return Err(CommandError::new("invalid_input", "text must not be empty"));
    }

    let session = UiaSession::new()?;
    let foregrounded = foreground_window(&session, hwnd)?;
    let element = if let Some(ref_str) = reference {
        let stored = store.resolve_ref_or_stale(ref_str)?;
        if stored.hwnd != hwnd {
            return Err(CommandError::new(
                "invalid_input",
                "reference does not belong to the provided hwnd",
            ));
        }
        resolve_stored_element(&session, &stored)?
    } else {
        session
            .automation
            .element_from_handle(hwnd_from_i64(hwnd)?)
            .map_err(|error| map_uia_error(error, "send_keys_failed"))?
    };

    let _ = element.set_focus();
    element
        .send_keys(text, 10)
        .map_err(|error| map_uia_error(error, "send_keys_failed"))?;
    Ok(ActionResult {
        ok: true,
        method: "send_keys".to_string(),
        foregrounded,
    })
}

pub fn focus_impl(store: &SnapshotStore, reference: &str) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;
    element
        .set_focus()
        .map_err(|error| map_uia_error(error, "focus_failed"))?;
    Ok(ActionResult {
        ok: true,
        method: "focus".to_string(),
        foregrounded,
    })
}

pub fn get_value_impl(store: &SnapshotStore, reference: &str) -> Result<GetValueResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;

    if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
        if let Ok(value) = pattern.get_value() {
            if is_useful_value(&value) {
                return Ok(GetValueResult {
                    value,
                    kind: "text".to_string(),
                    min: None,
                    max: None,
                    method: "value_pattern".to_string(),
                });
            }
        }
    }

    if let Ok(pattern) = element.get_pattern::<UIRangeValuePattern>() {
        let value = pattern
            .get_value()
            .map_err(|error| map_uia_error(error, "get_value_failed"))?;
        let min = pattern.get_minimum().ok();
        let max = pattern.get_maximum().ok();
        return Ok(GetValueResult {
            value: value.to_string(),
            kind: "range".to_string(),
            min,
            max,
            method: "range_value".to_string(),
        });
    }

    if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
        if let Ok(value) = pattern.get_value() {
            if is_useful_value(&value) {
                return Ok(GetValueResult {
                    value,
                    kind: "text".to_string(),
                    min: None,
                    max: None,
                    method: "legacy".to_string(),
                });
            }
        }
    }

    Ok(GetValueResult {
        value: String::new(),
        kind: "empty".to_string(),
        min: None,
        max: None,
        method: "empty".to_string(),
    })
}

pub fn scroll_element_impl(
    store: &SnapshotStore,
    reference: &str,
    direction: &str,
    amount: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;
    let (horizontal, vertical) = scroll_amounts(direction, amount)?;
    let target = find_scrollable_element(&session, &element)?;

    target
        .get_pattern::<UIScrollPattern>()
        .map_err(|error| map_uia_error(error, "scroll_unavailable"))?
        .scroll(horizontal, vertical)
        .map_err(|error| map_uia_error(error, "scroll_failed"))?;

    Ok(ActionResult {
        ok: true,
        method: "scroll".to_string(),
        foregrounded,
    })
}

pub fn right_click_element_impl(
    store: &SnapshotStore,
    reference: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;
    prepare_for_click(&element)?;
    element
        .right_click()
        .map_err(|error| map_uia_error(error, "right_click_failed"))?;
    Ok(ActionResult {
        ok: true,
        method: "right_click".to_string(),
        foregrounded,
    })
}

pub fn invoke_action_impl(
    store: &SnapshotStore,
    reference: &str,
    action: &str,
) -> Result<ActionResult, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    let element = resolve_stored_element(&session, &stored)?;
    let foregrounded = foreground_window(&session, stored.hwnd)?;
    let method = parse_invoke_action(action)?;

    match method {
        "press" => {
            let pattern = element.get_pattern::<UIInvokePattern>().map_err(|_| {
                CommandError::new(
                    "action_unavailable",
                    "Invoke pattern is not available on this element",
                )
            })?;
            pattern
                .invoke()
                .map_err(|error| map_uia_error(error, "invoke_action_failed"))?;
        }
        "toggle" => {
            let pattern = element.get_pattern::<UITogglePattern>().map_err(|_| {
                CommandError::new(
                    "action_unavailable",
                    "Toggle pattern is not available on this element",
                )
            })?;
            pattern
                .toggle()
                .map_err(|error| map_uia_error(error, "invoke_action_failed"))?;
        }
        "expand" => {
            let pattern = element
                .get_pattern::<UIExpandCollapsePattern>()
                .map_err(|_| {
                    CommandError::new(
                        "action_unavailable",
                        "ExpandCollapse pattern is not available on this element",
                    )
                })?;
            pattern
                .expand()
                .map_err(|error| map_uia_error(error, "invoke_action_failed"))?;
        }
        "collapse" => {
            let pattern = element
                .get_pattern::<UIExpandCollapsePattern>()
                .map_err(|_| {
                    CommandError::new(
                        "action_unavailable",
                        "ExpandCollapse pattern is not available on this element",
                    )
                })?;
            pattern
                .collapse()
                .map_err(|error| map_uia_error(error, "invoke_action_failed"))?;
        }
        "select" => {
            let pattern = element
                .get_pattern::<UISelectionItemPattern>()
                .map_err(|_| {
                    CommandError::new(
                        "action_unavailable",
                        "SelectionItem pattern is not available on this element",
                    )
                })?;
            pattern
                .select()
                .map_err(|error| map_uia_error(error, "invoke_action_failed"))?;
        }
        _ => {
            return Err(CommandError::new(
                "invalid_input",
                format!("Unknown action: {action}"),
            ));
        }
    }

    Ok(ActionResult {
        ok: true,
        method: method.to_string(),
        foregrounded,
    })
}

fn parse_invoke_action(action: &str) -> Result<&'static str, CommandError> {
    match action {
        "toggle" => Ok("toggle"),
        "expand" => Ok("expand"),
        "collapse" => Ok("collapse"),
        "press" => Ok("press"),
        "select" => Ok("select"),
        _ => Err(CommandError::new(
            "invalid_input",
            format!("action must be one of toggle, expand, collapse, press, select; got {action}"),
        )),
    }
}

fn scroll_amounts(
    direction: &str,
    amount: &str,
) -> Result<(ScrollAmount, ScrollAmount), CommandError> {
    let step = match amount {
        "large" => "large",
        "small" | "" => "small",
        other => {
            return Err(CommandError::new(
                "invalid_input",
                format!("amount must be small or large; got {other}"),
            ));
        }
    };

    let increment = if step == "large" {
        ScrollAmount::LargeIncrement
    } else {
        ScrollAmount::SmallIncrement
    };
    let decrement = if step == "large" {
        ScrollAmount::LargeDecrement
    } else {
        ScrollAmount::SmallDecrement
    };

    match direction {
        "up" => Ok((ScrollAmount::NoAmount, decrement)),
        "down" => Ok((ScrollAmount::NoAmount, increment)),
        "left" => Ok((decrement, ScrollAmount::NoAmount)),
        "right" => Ok((increment, ScrollAmount::NoAmount)),
        other => Err(CommandError::new(
            "invalid_input",
            format!("direction must be up, down, left, or right; got {other}"),
        )),
    }
}

fn find_scrollable_element(
    session: &UiaSession,
    element: &UIElement,
) -> Result<UIElement, CommandError> {
    if element.get_pattern::<UIScrollPattern>().is_ok() {
        return Ok(element.clone());
    }

    let mut current = element.clone();
    for _ in 0..8 {
        let walker = session
            .automation
            .get_control_view_walker()
            .map_err(|error| map_uia_error(error, "scroll_unavailable"))?;
        match walker.get_parent_build_cache(&current, &session.cache_request) {
            Ok(parent) => {
                if parent.get_pattern::<UIScrollPattern>().is_ok() {
                    return Ok(parent);
                }
                current = parent;
            }
            Err(_) => break,
        }
    }

    Err(CommandError::new(
        "scroll_unavailable",
        "No scrollable ancestor found for this element",
    ))
}

struct UiaSession {
    automation: UIAutomation,
    cache_request: uiautomation::core::UICacheRequest,
}

impl UiaSession {
    fn new() -> Result<Self, CommandError> {
        let automation = UIAutomation::new().map_err(|error| {
            CommandError::new("uia_init_failed", error.to_string())
        })?;
        configure_timeouts(&automation);

        let cache_request = automation
            .create_cache_request()
            .map_err(|error| map_uia_error(error, "uia_init_failed"))?;
        for property in [
            UIProperty::Name,
            UIProperty::ControlType,
            UIProperty::AutomationId,
            UIProperty::IsEnabled,
            UIProperty::IsOffscreen,
            UIProperty::BoundingRectangle,
            UIProperty::ValueValue,
            UIProperty::RuntimeId,
            UIProperty::IsInvokePatternAvailable,
            UIProperty::IsValuePatternAvailable,
            UIProperty::IsTogglePatternAvailable,
            UIProperty::IsLegacyIAccessiblePatternAvailable,
        ] {
            cache_request
                .add_property(property)
                .map_err(|error| map_uia_error(error, "uia_init_failed"))?;
        }
        for pattern in [
            UIPatternType::Invoke,
            UIPatternType::Value,
            UIPatternType::Toggle,
            UIPatternType::LegacyIAccessible,
        ] {
            cache_request
                .add_pattern(pattern)
                .map_err(|error| map_uia_error(error, "uia_init_failed"))?;
        }

        Ok(Self {
            automation,
            cache_request,
        })
    }
}

fn configure_timeouts(automation: &UIAutomation) {
    use windows::core::Interface;
    use windows::Win32::UI::Accessibility::IUIAutomation2;

    if let Ok(automation2) = automation.as_ref().cast::<IUIAutomation2>() {
        unsafe {
            let _ = automation2.SetConnectionTimeout(CONNECTION_TIMEOUT_MS);
            let _ = automation2.SetTransactionTimeout(TRANSACTION_TIMEOUT_MS);
        }
    }
}

struct OutlineBuilder<'a> {
    store: &'a SnapshotStore,
    hwnd: i64,
    generation: u32,
    process_id: u32,
    max_elements: u32,
    next_index: u32,
    emitted: u32,
    lines: Vec<String>,
}

impl<'a> OutlineBuilder<'a> {
    fn new(
        store: &'a SnapshotStore,
        hwnd: i64,
        generation: u32,
        process_id: u32,
        max_elements: u32,
    ) -> Self {
        Self {
            store,
            hwnd,
            generation,
            process_id,
            max_elements,
            next_index: 0,
            emitted: 0,
            lines: Vec::new(),
        }
    }

    fn finish(self) -> String {
        self.lines.join("\n")
    }

    fn walk(
        &mut self,
        session: &UiaSession,
        element: &UIElement,
        depth: u32,
        max_depth: u32,
        force_children: bool,
        budget: &mut SearchBudget,
    ) -> Result<(), CommandError> {
        if self.emitted >= self.max_elements || budget.exhausted() {
            return Ok(());
        }

        if !budget.visit_soft() {
            return Ok(());
        }

        let control_type = element_control_type(element)
            .map_err(|error| map_uia_error(error, "snapshot_failed"))?;

        if should_skip_control(control_type) {
            return Ok(());
        }

        let collapse = !force_children && should_collapse_control(control_type, depth);
        if is_interactive_or_named(element, control_type)? || collapse {
            self.next_index += 1;
            let reference = make_reference(self.next_index, self.generation);
            let runtime_id = element_runtime_id(element)
                .map_err(|error| map_uia_error(error, "snapshot_failed"))?;
            let (name, role) = element_storage_hints(element);
            self.store.store_element(
                self.hwnd,
                self.generation,
                reference.clone(),
                runtime_id,
                self.process_id,
                name,
                role,
            );
            self.lines.push(format_element_line(element, depth, &reference)?);
            self.emitted += 1;
        }

        if collapse || depth >= max_depth || self.emitted >= self.max_elements {
            return Ok(());
        }

        let walker = session
            .automation
            .get_control_view_walker()
            .map_err(|error| map_uia_error(error, "snapshot_failed"))?;
        let mut child = walker
            .get_first_child_build_cache(element, &session.cache_request)
            .ok();
        let mut sibling_count = 0u32;
        while let Some(current) = child {
            if self.emitted >= self.max_elements || budget.exhausted() {
                self.lines.push(format!(
                    "{:indent$}+more elements omitted",
                    "",
                    indent = depth as usize + 1
                ));
                break;
            }
            self.walk(session, &current, depth + 1, max_depth, false, budget)?;
            sibling_count += 1;
            if sibling_count >= MAX_SIBLING_REPEAT {
                self.lines.push(format!(
                    "{:indent$}+more siblings like this",
                    "",
                    indent = depth as usize + 1
                ));
                break;
            }
            child = walker
                .get_next_sibling_build_cache(&current, &session.cache_request)
                .ok();
        }

        Ok(())
    }
}

struct ElementFinder<'a> {
    name_filter: &'a str,
    role_filter: Option<ControlType>,
    matches: Vec<UIElement>,
}

impl<'a> ElementFinder<'a> {
    fn new(name_filter: &'a str, role_filter: Option<ControlType>) -> Self {
        Self {
            name_filter,
            role_filter,
            matches: Vec::new(),
        }
    }

    fn search(
        &mut self,
        session: &UiaSession,
        element: &UIElement,
        depth: u32,
        max_depth: u32,
        budget: &mut SearchBudget,
    ) -> Result<(), CommandError> {
        if self.matches.len() >= MAX_FIND_CANDIDATES || budget.exhausted() {
            return Ok(());
        }

        if !budget.visit_soft() {
            return Ok(());
        }

        let control_type = element_control_type(element)
            .map_err(|error| map_uia_error(error, "find_failed"))?;

        if should_skip_control(control_type) {
            return Ok(());
        }

        if element_matches(element, control_type, self.name_filter, self.role_filter)? {
            self.matches.push(element.clone());
            if self.matches.len() >= MAX_FIND_CANDIDATES {
                return Ok(());
            }
        }

        if should_collapse_control(control_type, depth) || depth >= max_depth {
            return Ok(());
        }

        let walker = session
            .automation
            .get_control_view_walker()
            .map_err(|error| map_uia_error(error, "find_failed"))?;
        let mut child = walker
            .get_first_child_build_cache(element, &session.cache_request)
            .ok();
        let mut sibling_count = 0u32;
        while let Some(current) = child {
            if self.matches.len() >= MAX_FIND_CANDIDATES || budget.exhausted() {
                break;
            }
            self.search(session, &current, depth + 1, max_depth, budget)?;
            sibling_count += 1;
            if sibling_count >= FIND_MAX_SIBLING_REPEAT {
                break;
            }
            child = walker
                .get_next_sibling_build_cache(&current, &session.cache_request)
                .ok();
        }

        Ok(())
    }
}

fn element_matches(
    element: &UIElement,
    control_type: ControlType,
    name_filter: &str,
    role_filter: Option<ControlType>,
) -> Result<bool, CommandError> {
    if let Some(role) = role_filter {
        if control_type != role {
            return Ok(false);
        }
    }

    let name = element_name(element).to_ascii_lowercase();
    Ok(name.contains(name_filter))
}

fn format_element_line(
    element: &UIElement,
    depth: u32,
    reference: &str,
) -> Result<String, CommandError> {
    let role = element_control_type(element)
        .map(|control_type| control_type.to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let name = element_name(element).replace('"', "'");
    let mut state: Vec<String> = Vec::new();
    if element_is_enabled(element) == Some(false) {
        state.push("disabled".to_string());
    }
    if element_is_offscreen(element) == Some(true) {
        state.push("offscreen".to_string());
    }
    if let Some(value_text) = element_value_text(element) {
        if is_useful_value(&value_text) {
            state.push(format!("value=\"{}\"", value_text.replace('"', "'")));
        }
    }

    let state_suffix = if state.is_empty() {
        String::new()
    } else {
        format!(" [{}]", state.join(", "))
    };

    Ok(format!(
        "{:indent$}{reference} {role} \"{name}\"{state_suffix}",
        "",
        indent = depth as usize * 2
    ))
}

fn element_storage_hints(element: &UIElement) -> (String, Option<String>) {
    let name = element_name(element);
    let role = element_control_type(element)
        .ok()
        .map(|control_type| control_type.to_string());
    (name, role)
}

fn element_name(element: &UIElement) -> String {
    element
        .get_cached_name()
        .or_else(|_| element.get_name())
        .unwrap_or_default()
}

fn element_control_type(element: &UIElement) -> Result<ControlType, uiautomation::Error> {
    element
        .get_cached_control_type()
        .or_else(|_| element.get_control_type())
}

fn element_is_enabled(element: &UIElement) -> Option<bool> {
    element
        .is_cached_enabled()
        .or_else(|_| element.is_enabled())
        .ok()
}

fn element_is_offscreen(element: &UIElement) -> Option<bool> {
    element
        .is_cached_offscreen()
        .or_else(|_| element.is_offscreen())
        .ok()
}

fn element_value_text(element: &UIElement) -> Option<String> {
    element
        .get_cached_property_value(UIProperty::ValueValue)
        .or_else(|_| element.get_property_value(UIProperty::ValueValue))
        .ok()
        .map(|value| value.to_string())
}

fn element_runtime_id(element: &UIElement) -> Result<Vec<i32>, uiautomation::Error> {
    if let Ok(variant) = element.get_cached_property_value(UIProperty::RuntimeId) {
        if let Ok(ids) = runtime_id_from_variant(&variant) {
            return Ok(ids);
        }
    }
    element.get_runtime_id()
}

fn runtime_id_from_variant(variant: &Variant) -> Result<Vec<i32>, uiautomation::Error> {
    match TryInto::<Value>::try_into(variant)? {
        Value::ArrayI4(ids) => Ok(ids),
        Value::SAFEARRAY(arr) => arr.try_into(),
        _ => {
            let arr = variant.get_array()?;
            arr.try_into()
        }
    }
}

fn resolve_stored_element(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<UIElement, CommandError> {
    Ok(resolve_stored_element_with_stats(session, stored)?.0)
}

#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct ResolveStats {
    pub nodes_visited: u32,
}

/// Resolve a stored reference and return visit stats (for a11y-bench).
#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub fn resolve_reference_with_stats(
    store: &SnapshotStore,
    reference: &str,
) -> Result<ResolveStats, CommandError> {
    let stored = store.resolve_ref_or_stale(reference)?;
    let session = UiaSession::new()?;
    Ok(resolve_stored_element_with_stats(&session, &stored)?.1)
}

fn resolve_stored_element_with_stats(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<(UIElement, ResolveStats), CommandError> {
    let mut last_error: Option<CommandError> = None;
    for attempt in 0..RESOLVE_RETRY_ATTEMPTS {
        match resolve_stored_element_once(session, stored) {
            Ok(result) => return Ok(result),
            Err(error) if is_transient_command_error(&error) && attempt + 1 < RESOLVE_RETRY_ATTEMPTS => {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(
                    TRANSIENT_UIA_RETRY_MS * (attempt as u64 + 1),
                ));
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error.unwrap_or_else(|| {
        CommandError::new("resolve_failed", "Failed to resolve accessibility element")
    }))
}

fn resolve_stored_element_once(
    session: &UiaSession,
    stored: &StoredElement,
) -> Result<(UIElement, ResolveStats), CommandError> {
    let handle = hwnd_from_i64(stored.hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.cache_request)
        .map_err(|error| map_uia_error(error, "resolve_failed"))?;

    if let Some(element) = find_by_runtime_id(session, &root, &stored.runtime_id)? {
        return Ok((
            element,
            ResolveStats {
                nodes_visited: 1,
            },
        ));
    }

    if !stored.name.trim().is_empty() {
        if let Some(element) = resolve_element_by_hints(session, stored, &root) {
            return Ok((
                element,
                ResolveStats {
                    nodes_visited: 0,
                },
            ));
        }
    }

    Err(CommandError::new(
        "stale_reference",
        "Element no longer exists in the target window; take a new snapshot or find_element call",
    ))
}

fn resolve_element_by_hints(
    session: &UiaSession,
    stored: &StoredElement,
    window: &UIElement,
) -> Option<UIElement> {
    let search_root = find_web_search_root(session, window);
    for mode in [UIMatcherMode::Control, UIMatcherMode::Content] {
        let mut matcher = session
            .automation
            .create_matcher()
            .from(search_root.clone())
            .match_name(stored.name.trim())
            .mode(mode)
            .depth(FIND_MATCHER_MAX_DEPTH)
            .timeout(2_000)
            .interval(100);

        if let Some(role) = stored.role.as_deref().and_then(parse_role_label) {
            matcher = matcher.control_type(role);
        }

        if let Ok(element) = matcher.find_first() {
            return Some(element);
        }
    }
    None
}

fn parse_role_label(role: &str) -> Option<ControlType> {
    parse_role(role).ok()
}

fn find_by_runtime_id(
    session: &UiaSession,
    root: &UIElement,
    target: &[i32],
) -> Result<Option<UIElement>, CommandError> {
    if target.is_empty() {
        return Ok(None);
    }

    let variant = Variant::from(Value::ArrayI4(target.to_vec()));
    let condition = session
        .automation
        .create_property_condition(UIProperty::RuntimeId, variant, None)
        .map_err(|error| map_uia_error(error, "resolve_failed"))?;

    match root.find_first_build_cache(TreeScope::Subtree, &condition, &session.cache_request) {
        Ok(element) => Ok(Some(element)),
        Err(error) if error.code() == ERR_NOTFOUND => Ok(None),
        Err(error) => Err(map_uia_error(error, "resolve_failed")),
    }
}

fn foreground_window(session: &UiaSession, hwnd: i64) -> Result<bool, CommandError> {
    let handle = hwnd_from_i64(hwnd)?;
    let element = session
        .automation
        .element_from_handle(handle)
        .map_err(|error| map_uia_error(error, "focus_denied"))?;
    let window = WindowControl::try_from(&element)
        .map_err(|error| map_uia_error(error, "focus_denied"))?;
    window
        .set_foregrand()
        .map_err(|_| {
            CommandError::new(
                "focus_denied",
                "Could not bring target window to foreground",
            )
        })
}

fn parse_role(role: &str) -> Result<ControlType, CommandError> {
    match role.trim().to_ascii_lowercase().as_str() {
        "button" => Ok(ControlType::Button),
        "edit" => Ok(ControlType::Edit),
        "combobox" => Ok(ControlType::ComboBox),
        "checkbox" => Ok(ControlType::CheckBox),
        "radiobutton" => Ok(ControlType::RadioButton),
        "menuitem" => Ok(ControlType::MenuItem),
        "hyperlink" => Ok(ControlType::Hyperlink),
        "tabitem" => Ok(ControlType::TabItem),
        "listitem" => Ok(ControlType::ListItem),
        "treeitem" => Ok(ControlType::TreeItem),
        "slider" => Ok(ControlType::Slider),
        "spinner" => Ok(ControlType::Spinner),
        "document" => Ok(ControlType::Document),
        "pane" => Ok(ControlType::Pane),
        "window" => Ok(ControlType::Window),
        other => Err(CommandError::new(
            "invalid_input",
            format!("Unsupported role filter: {other}"),
        )),
    }
}

fn is_interactive_or_named(element: &UIElement, control_type: ControlType) -> Result<bool, CommandError> {
    if is_interactive_control(control_type) {
        return Ok(true);
    }
    let name = element_name(element);
    Ok(!name.trim().is_empty())
}

fn is_interactive_control(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Button
            | ControlType::Edit
            | ControlType::ComboBox
            | ControlType::CheckBox
            | ControlType::RadioButton
            | ControlType::MenuItem
            | ControlType::Hyperlink
            | ControlType::TabItem
            | ControlType::ListItem
            | ControlType::TreeItem
            | ControlType::Slider
            | ControlType::Spinner
            | ControlType::SplitButton
    )
}

/// Shallow Document/Pane nodes hold Chromium web content — always descend into them.
/// Only collapse deep structural panes to limit token use.
fn should_collapse_control(control_type: ControlType, depth: u32) -> bool {
    matches!(control_type, ControlType::Pane) && depth >= 6
}

fn is_useful_value(value_text: &str) -> bool {
    if value_text.is_empty() || value_text == "EMPTY" {
        return false;
    }
    // uiautomation placeholder when ValueValue is unset
    !(value_text.starts_with("STRING(")
        || value_text.starts_with("INT(")
        || value_text.starts_with("BOOL("))
}

fn should_skip_control(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Text | ControlType::Image | ControlType::Separator | ControlType::ToolTip
    )
}

fn hwnd_from_i64(hwnd: i64) -> Result<Handle, CommandError> {
    if hwnd == 0 {
        return Err(CommandError::new("invalid_hwnd", "Window handle must not be zero"));
    }
    Ok(Handle::from(HWND(hwnd as isize as *mut _)))
}

fn map_uia_error(error: uiautomation::Error, code: &str) -> CommandError {
    if let Some(result) = error.result() {
        if result.0 == windows::Win32::Foundation::E_ACCESSDENIED.0 {
            return CommandError::new(
                "elevation_required",
                "Target window is elevated or otherwise inaccessible",
            );
        }
    }
    CommandError::new(code, error.to_string())
}

fn is_transient_subscriber_error(error: &uiautomation::Error) -> bool {
    const EVENT_E_ALL_SUBSCRIBERS_FAILED: i32 = -2147220991;
    error.code() == EVENT_E_ALL_SUBSCRIBERS_FAILED
        || error
            .message()
            .to_ascii_lowercase()
            .contains("unable to invoke any of the subscribers")
}

fn is_transient_command_error(error: &CommandError) -> bool {
    error
        .message
        .to_ascii_lowercase()
        .contains("unable to invoke any of the subscribers")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interactive_control_detection() {
        assert!(is_interactive_control(ControlType::Button));
        assert!(!is_interactive_control(ControlType::Pane));
    }

    #[test]
    fn browser_content_nodes_are_not_collapsed() {
        assert!(!should_collapse_control(ControlType::Document, 0));
        assert!(!should_collapse_control(ControlType::Pane, 0));
        assert!(!should_collapse_control(ControlType::Pane, 3));
        assert!(should_collapse_control(ControlType::Pane, 6));
    }

    #[test]
    fn placeholder_values_are_filtered() {
        assert!(!is_useful_value("STRING()"));
        assert!(is_useful_value("hello"));
    }

    #[test]
    fn detects_transient_subscriber_errors() {
        let error = uiautomation::Error::new(
            -2147220991,
            "An event was unable to invoke any of the subscribers",
        );
        assert!(is_transient_subscriber_error(&error));
        assert!(is_transient_command_error(&CommandError::new(
            "resolve_failed",
            "An event was unable to invoke any of the subscribers"
        )));
    }

    #[test]
    fn maps_scroll_amounts() {
        let (h, v) = scroll_amounts("down", "small").expect("down small");
        assert_eq!(h, ScrollAmount::NoAmount);
        assert_eq!(v, ScrollAmount::SmallIncrement);

        let (h, v) = scroll_amounts("up", "large").expect("up large");
        assert_eq!(h, ScrollAmount::NoAmount);
        assert_eq!(v, ScrollAmount::LargeDecrement);

        let (h, v) = scroll_amounts("left", "small").expect("left small");
        assert_eq!(h, ScrollAmount::SmallDecrement);
        assert_eq!(v, ScrollAmount::NoAmount);

        assert!(scroll_amounts("diagonal", "small").is_err());
        assert!(scroll_amounts("down", "huge").is_err());
    }

    #[test]
    fn parses_invoke_actions() {
        assert_eq!(parse_invoke_action("press").unwrap(), "press");
        assert_eq!(parse_invoke_action("toggle").unwrap(), "toggle");
        assert!(parse_invoke_action("click").is_err());
    }
}
