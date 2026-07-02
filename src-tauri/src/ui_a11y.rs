//! Native accessibility tree snapshot and element interaction.
//!
//! Snapshots use forepaw (UIA / AX / AT-SPI). Clicks and typing use forepaw on macOS,
//! UI Automation on Windows, and Enigo pointer/keyboard on Linux when forepaw actions are stubs.

use std::sync::{Mutex, OnceLock};

use enigo::{Enigo, Keyboard, Settings};
#[cfg(not(target_os = "windows"))]
use enigo::Mouse;
use forepaw::core::element_tree::{ElementData, ElementNode, ElementRef, ElementTree};
#[cfg(target_os = "windows")]
use forepaw::core::ref_assigner::RefAssigner;
#[cfg(target_os = "windows")]
use forepaw::core::role::Role;
use forepaw::core::tree_renderer::TreeRenderer;
#[cfg(target_os = "windows")]
use forepaw::core::types::Rect;
use forepaw::platform::{AppTarget, DesktopProvider, SnapshotOptions};
#[cfg(not(target_os = "windows"))]
use forepaw::platform::WindowTarget;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use forepaw::platform::windows::WindowsProvider as PlatformProvider;
#[cfg(target_os = "macos")]
use forepaw::platform::darwin::DarwinProvider as PlatformProvider;
#[cfg(target_os = "linux")]
use forepaw::platform::linux::LinuxProvider as PlatformProvider;

#[cfg(target_os = "windows")]
use std::collections::HashMap;

#[cfg(target_os = "windows")]
use uiautomation::patterns::{UILegacyIAccessiblePattern, UIInvokePattern, UIValuePattern};
#[cfg(target_os = "windows")]
use uiautomation::types::{ControlType, Handle, Point as UiaPoint};
#[cfg(target_os = "windows")]
use uiautomation::{UIAutomation, UIElement, UITreeWalker};

#[cfg(target_os = "windows")]
const DEFAULT_MAX_DEPTH: usize = 8;
#[cfg(not(target_os = "windows"))]
const DEFAULT_MAX_DEPTH: usize = 12;
const MAX_INTERACTIVE_SUMMARY: usize = 80;
#[cfg(target_os = "windows")]
const WINDOWS_UIA_TIMEOUT_MS: u64 = 28_000;
#[cfg(target_os = "windows")]
const WINDOWS_UIA_NODE_BUDGET: usize = 350;
#[cfg(target_os = "windows")]
const WINDOWS_DOCUMENT_SCAN_BUDGET: usize = 180;
#[cfg(target_os = "windows")]
const WINDOWS_RESOLVE_SCAN_BUDGET: usize = 400;
#[cfg(target_os = "windows")]
const UI_ACTION_SETTLE_MS: u64 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiA11yInteractiveRef {
    pub id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiA11ySnapshotResponse {
    pub platform: String,
    pub app: String,
    pub element_count: u32,
    pub interactive_count: u32,
    pub truncated: bool,
    pub tree_text: String,
    pub interactive_refs: Vec<UiA11yInteractiveRef>,
    pub next_step: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiA11ySnapshotRequest {
    pub app_name: Option<String>,
    pub foreground_only: Option<bool>,
    pub max_depth: Option<u32>,
    pub interactive_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiA11yInteractResponse {
    pub action: String,
    pub element_id: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiA11yInteractRequest {
    pub element_id: String,
    pub action: String,
    pub text: Option<String>,
    pub click_count: Option<u8>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
struct ElementFingerprint {
    role: Role,
    control_type: ControlType,
    name: Option<String>,
    bounds: Option<Rect>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
struct SnapshotAnchor {
    hwnd: isize,
    document_bounds: Option<Rect>,
}

struct CachedSnapshot {
    app: AppTarget,
    #[allow(dead_code)]
    tree: ElementTree,
    #[cfg(target_os = "windows")]
    fingerprints: HashMap<ElementRef, ElementFingerprint>,
    #[cfg(target_os = "windows")]
    anchor: SnapshotAnchor,
}

fn session_cache() -> &'static Mutex<Option<CachedSnapshot>> {
    static CACHE: OnceLock<Mutex<Option<CachedSnapshot>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn clear_session_cache() {
    if let Ok(mut cache) = session_cache().lock() {
        *cache = None;
    }
}

fn platform_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn create_provider() -> PlatformProvider {
    PlatformProvider::new()
}

#[cfg(target_os = "windows")]
fn run_windows_uia<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)).unwrap_or_else(
            |_| Err("Windows UI Automation worker panicked".to_string()),
        );
        let _ = sender.send(result);
    });
    match receiver.recv_timeout(std::time::Duration::from_millis(WINDOWS_UIA_TIMEOUT_MS)) {
        Ok(result) => result,
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(format!(
            "Windows UI Automation timed out after {WINDOWS_UIA_TIMEOUT_MS} ms"
        )),
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            Err("Windows UI Automation worker thread disconnected".to_string())
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_automation() -> Result<UIAutomation, String> {
    UIAutomation::new().map_err(|error| format!("UI Automation init failed: {error}"))
}

#[cfg(target_os = "windows")]
fn foreground_app_target() -> Result<AppTarget, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    // SAFETY: Win32 foreground window query.
    let hwnd: HWND = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return Err("no foreground window".into());
    }
    let mut pid = 0u32;
    // SAFETY: Win32 PID lookup for a valid HWND.
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
        return Err("foreground window has no process id".into());
    }
    Ok(AppTarget::Pid(pid as i32))
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct WindowsWindowMatch {
    hwnd: windows::Win32::Foundation::HWND,
    area: i32,
}

#[cfg(target_os = "windows")]
fn find_windows_hwnd(app: &AppTarget) -> Result<windows::Win32::Foundation::HWND, String> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW,
        GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    struct Search {
        app: AppTarget,
        best: Option<WindowsWindowMatch>,
    }

    fn window_text(hwnd: HWND) -> String {
        // SAFETY: Reads the title for a valid top-level HWND; failures return an empty title.
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len == 0 {
                return String::new();
            }
            let mut buf = vec![0_u16; len.saturating_add(1) as usize];
            let written = GetWindowTextW(hwnd, &mut buf);
            if written == 0 {
                return String::new();
            }
            String::from_utf16_lossy(buf.get(..written as usize).unwrap_or_default())
        }
    }

    fn window_class(hwnd: HWND) -> String {
        let mut buf = [0_u16; 256];
        // SAFETY: Reads the class name into a fixed-size UTF-16 buffer.
        let written = unsafe { GetClassNameW(hwnd, &mut buf) };
        if written == 0 {
            return String::new();
        }
        String::from_utf16_lossy(buf.get(..written as usize).unwrap_or_default())
    }

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut Search);
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let mut pid = 0_u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let matched = match &search.app {
            AppTarget::Pid(target_pid) => pid == *target_pid as u32,
            AppTarget::Name(name) => {
                let name = name.to_lowercase();
                window_text(hwnd).to_lowercase().contains(&name)
                    || window_class(hwnd).to_lowercase().contains(&name)
            }
        };
        if !matched {
            return BOOL(1);
        }

        let mut rect = RECT::default();
        let area = if GetWindowRect(hwnd, &mut rect).is_ok() {
            (rect.right - rect.left).saturating_mul(rect.bottom - rect.top)
        } else {
            0
        };
        if area > search.best.map_or(0, |best| best.area) {
            search.best = Some(WindowsWindowMatch { hwnd, area });
        }
        BOOL(1)
    }

    if let AppTarget::Pid(pid) = app {
        // Prefer the foreground HWND for foreground snapshots, avoiding a full window scan.
        // SAFETY: Foreground window query plus PID lookup.
        let hwnd = unsafe { GetForegroundWindow() };
        let mut foreground_pid = 0_u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut foreground_pid));
        }
        if foreground_pid == *pid as u32 {
            return Ok(hwnd);
        }
    }

    let mut search = Search {
        app: app.clone(),
        best: None,
    };
    // SAFETY: Enumerates top-level windows and stores only HWND/area metadata in `search`.
    unsafe {
        EnumWindows(Some(enum_window), LPARAM(&raw mut search as isize))
            .map_err(|e| format!("EnumWindows failed: {e}"))?;
    }
    search
        .best
        .map(|matched| matched.hwnd)
        .ok_or_else(|| format!("no visible window matched {}", app.display()))
}

#[cfg(target_os = "windows")]
fn is_browser_app(app: &AppTarget) -> bool {
    let label = app.display().to_lowercase();
    ["chrome", "chromium", "msedge", "edge", "firefox", "brave", "gmail"]
        .iter()
        .any(|keyword| label.contains(keyword))
}

#[cfg(target_os = "windows")]
fn windows_window_class(hwnd: windows::Win32::Foundation::HWND) -> String {
    use windows::Win32::UI::WindowsAndMessaging::GetClassNameW;

    let mut buf = [0_u16; 256];
    // SAFETY: Reads the class name into a fixed-size UTF-16 buffer.
    let written = unsafe { GetClassNameW(hwnd, &mut buf) };
    if written == 0 {
        return String::new();
    }
    String::from_utf16_lossy(buf.get(..written as usize).unwrap_or_default())
}

#[cfg(target_os = "windows")]
fn is_browser_window_class(class_name: &str) -> bool {
    let class_name = class_name.to_lowercase();
    class_name.contains("chrome_widgetwin")
        || class_name.contains("mozillawindowclass")
        || class_name.contains("applicationframewindow")
}

#[cfg(target_os = "windows")]
fn is_browser_context(app: &AppTarget, hwnd: windows::Win32::Foundation::HWND) -> bool {
    is_browser_app(app) || is_browser_window_class(&windows_window_class(hwnd))
}

#[cfg(target_os = "windows")]
fn uia_document_area(element: &UIElement) -> i32 {
    element
        .get_bounding_rectangle()
        .ok()
        .map(|rect| {
            (rect.get_right() - rect.get_left())
                .saturating_mul(rect.get_bottom() - rect.get_top())
        })
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn find_browser_document_root(
    walker: &UITreeWalker,
    window: &UIElement,
    preferred_bounds: Option<Rect>,
) -> Option<UIElement> {
    let mut scan_budget = WINDOWS_DOCUMENT_SCAN_BUDGET;
    let mut stack = vec![window.clone()];
    let mut best: Option<(UIElement, i32)> = None;

    while let Some(element) = stack.pop() {
        if scan_budget == 0 {
            break;
        }
        scan_budget -= 1;

        if element.get_control_type().ok() == Some(ControlType::Document) {
            let area = uia_document_area(&element);
            if area > 0 {
                let score = if let Some(preferred) = preferred_bounds {
                    element
                        .get_bounding_rectangle()
                        .ok()
                        .and_then(|rect| rect_from_uia(rect))
                        .map(|actual| {
                            if bounds_overlap(preferred, actual) {
                                area + 1_000_000
                            } else {
                                area
                            }
                        })
                        .unwrap_or(area)
                } else {
                    area
                };
                if best.as_ref().map_or(0, |(_, best_area)| *best_area) < score {
                    best = Some((element.clone(), score));
                }
            }
        }

        let Some(children) = walker.get_children(&element) else {
            continue;
        };
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }

    best.map(|(element, _)| element)
}

#[cfg(target_os = "windows")]
fn uia_name_matches(element: &UIElement, expected: &str) -> bool {
    element.get_name().ok().is_some_and(|name| {
        let name = name.to_lowercase();
        let expected = expected.to_lowercase();
        name == expected || name.contains(&expected)
    })
}

#[cfg(target_os = "windows")]
fn control_type_from_role(role: Role) -> ControlType {
    match role {
        Role::Button => ControlType::Button,
        Role::Calendar => ControlType::Calendar,
        Role::CheckBox => ControlType::CheckBox,
        Role::ComboBox => ControlType::ComboBox,
        Role::TextField => ControlType::Edit,
        Role::Link => ControlType::Hyperlink,
        Role::Image => ControlType::Image,
        Role::Cell => ControlType::ListItem,
        Role::List => ControlType::List,
        Role::Menu => ControlType::Menu,
        Role::MenuBar => ControlType::MenuBar,
        Role::MenuItem => ControlType::MenuItem,
        Role::ProgressIndicator => ControlType::ProgressBar,
        Role::RadioButton => ControlType::RadioButton,
        Role::ScrollBar => ControlType::ScrollBar,
        Role::Slider => ControlType::Slider,
        Role::Incrementor => ControlType::Spinner,
        Role::StaticText => ControlType::Text,
        Role::TabGroup => ControlType::Tab,
        Role::Tab => ControlType::TabItem,
        Role::Toolbar => ControlType::ToolBar,
        Role::Outline => ControlType::Tree,
        Role::TreeItem => ControlType::TreeItem,
        Role::Group => ControlType::Group,
        Role::Table => ControlType::Table,
        Role::TextArea => ControlType::Document,
        Role::MenuButton => ControlType::SplitButton,
        Role::Window => ControlType::Window,
        Role::Unknown | _ => ControlType::Custom,
    }
}

#[cfg(target_os = "windows")]
fn is_interactive_control_type(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Button
            | ControlType::CheckBox
            | ControlType::ComboBox
            | ControlType::Edit
            | ControlType::Hyperlink
            | ControlType::ListItem
            | ControlType::MenuItem
            | ControlType::RadioButton
            | ControlType::SplitButton
            | ControlType::TabItem
            | ControlType::TreeItem
            | ControlType::Document
    )
}

#[cfg(target_os = "windows")]
fn is_traversal_container(control_type: ControlType) -> bool {
    matches!(
        control_type,
        ControlType::Document
            | ControlType::Pane
            | ControlType::Group
            | ControlType::Window
            | ControlType::List
            | ControlType::Menu
            | ControlType::Tree
            | ControlType::ToolBar
            | ControlType::Tab
            | ControlType::DataGrid
            | ControlType::Table
    )
}

#[cfg(target_os = "windows")]
fn should_descend_uia(element: &UIElement, interactive_only: bool) -> bool {
    if !interactive_only {
        return true;
    }
    let Ok(control_type) = element.get_control_type() else {
        return true;
    };
    if is_interactive_control_type(control_type) || is_traversal_container(control_type) {
        return true;
    }
    element
        .get_name()
        .ok()
        .is_some_and(|name| !name.trim().is_empty())
}

#[cfg(target_os = "windows")]
fn control_type_for_node(node: &ElementNode) -> ControlType {
    node.data
        .native_role
        .as_deref()
        .and_then(parse_uia_control_type_label)
        .unwrap_or_else(|| control_type_from_role(node.data.role))
}

#[cfg(target_os = "windows")]
fn parse_uia_control_type_label(label: &str) -> Option<ControlType> {
    match label.trim() {
        "Button" => Some(ControlType::Button),
        "Calendar" => Some(ControlType::Calendar),
        "CheckBox" => Some(ControlType::CheckBox),
        "ComboBox" => Some(ControlType::ComboBox),
        "Edit" => Some(ControlType::Edit),
        "Hyperlink" => Some(ControlType::Hyperlink),
        "Image" => Some(ControlType::Image),
        "ListItem" | "DataItem" => Some(ControlType::ListItem),
        "List" => Some(ControlType::List),
        "Menu" => Some(ControlType::Menu),
        "MenuBar" => Some(ControlType::MenuBar),
        "MenuItem" => Some(ControlType::MenuItem),
        "ProgressBar" => Some(ControlType::ProgressBar),
        "RadioButton" => Some(ControlType::RadioButton),
        "ScrollBar" => Some(ControlType::ScrollBar),
        "Slider" => Some(ControlType::Slider),
        "Spinner" => Some(ControlType::Spinner),
        "Text" => Some(ControlType::Text),
        "Tab" => Some(ControlType::Tab),
        "TabItem" => Some(ControlType::TabItem),
        "ToolBar" => Some(ControlType::ToolBar),
        "Tree" => Some(ControlType::Tree),
        "TreeItem" => Some(ControlType::TreeItem),
        "Group" => Some(ControlType::Group),
        "Pane" => Some(ControlType::Pane),
        "Table" | "DataGrid" => Some(ControlType::Table),
        "Document" => Some(ControlType::Document),
        "SplitButton" => Some(ControlType::SplitButton),
        "Window" => Some(ControlType::Window),
        "Custom" => Some(ControlType::Custom),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn collect_fingerprints(
    node: &ElementNode,
    out: &mut HashMap<ElementRef, ElementFingerprint>,
) {
    if let Some(reference) = node.data.reference {
        out.insert(
            reference,
            ElementFingerprint {
                role: node.data.role,
                control_type: control_type_for_node(node),
                name: node.data.name.clone(),
                bounds: node.data.bounds,
            },
        );
    }
    for child in &node.children {
        collect_fingerprints(child, out);
    }
}

#[cfg(target_os = "windows")]
fn bounds_near(expected: Rect, actual: &uiautomation::types::Rect) -> bool {
    let actual_width = actual.get_right() - actual.get_left();
    let actual_height = actual.get_bottom() - actual.get_top();
    if actual_width <= 0 || actual_height <= 0 {
        return false;
    }
    let dx = (expected.x - f64::from(actual.get_left())).abs();
    let dy = (expected.y - f64::from(actual.get_top())).abs();
    dx <= 48.0 && dy <= 48.0
}

#[cfg(target_os = "windows")]
fn bounds_overlap(expected: Rect, actual: Rect) -> bool {
    let expected_right = expected.x + expected.width;
    let expected_bottom = expected.y + expected.height;
    let actual_right = actual.x + actual.width;
    let actual_bottom = actual.y + actual.height;
    let overlap_width =
        expected_right.min(actual_right) - expected.x.max(actual.x);
    let overlap_height =
        expected_bottom.min(actual_bottom) - expected.y.max(actual.y);
    if overlap_width <= 0.0 || overlap_height <= 0.0 {
        return false;
    }
    let overlap_area = overlap_width * overlap_height;
    let expected_area = expected.width * expected.height;
    expected_area > 0.0 && overlap_area / expected_area >= 0.5
}

#[cfg(target_os = "windows")]
fn bounds_center(bounds: Rect) -> (i32, i32) {
    (
        (bounds.x + bounds.width / 2.0).round() as i32,
        (bounds.y + bounds.height / 2.0).round() as i32,
    )
}

#[cfg(target_os = "windows")]
fn find_element_by_fingerprint(
    walker: &UITreeWalker,
    root: &UIElement,
    fingerprint: &ElementFingerprint,
) -> Result<UIElement, String> {
    if let Ok(element) = find_element_by_type_and_name(walker, root, fingerprint) {
        return Ok(element);
    }
    if fingerprint
        .name
        .as_ref()
        .is_some_and(|name| !name.trim().is_empty())
    {
        if let Ok(element) = find_element_by_name_only(walker, root, fingerprint) {
            return Ok(element);
        }
    }
    if let Some(bounds) = fingerprint.bounds {
        if let Ok(element) = find_element_by_bounds_overlap(walker, root, bounds) {
            return Ok(element);
        }
    }
    Err(format!(
        "element not found (role={:?}, name={:?}) — UI may have changed; snapshot again",
        fingerprint.role, fingerprint.name
    ))
}

#[cfg(target_os = "windows")]
fn find_element_by_type_and_name(
    walker: &UITreeWalker,
    root: &UIElement,
    fingerprint: &ElementFingerprint,
) -> Result<UIElement, String> {
    let mut scan_budget = WINDOWS_RESOLVE_SCAN_BUDGET;
    let mut stack = vec![root.clone()];
    let mut candidates = Vec::new();

    while let Some(element) = stack.pop() {
        if scan_budget == 0 {
            break;
        }
        scan_budget -= 1;

        if element.get_control_type().ok() == Some(fingerprint.control_type)
            && fingerprint_name_matches(&element, fingerprint)
        {
            candidates.push(element.clone());
        }

        let Some(children) = walker.get_children(&element) else {
            continue;
        };
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }

    pick_fingerprint_candidate(fingerprint, candidates)
}

#[cfg(target_os = "windows")]
fn find_element_by_name_only(
    walker: &UITreeWalker,
    root: &UIElement,
    fingerprint: &ElementFingerprint,
) -> Result<UIElement, String> {
    let mut scan_budget = WINDOWS_RESOLVE_SCAN_BUDGET;
    let mut stack = vec![root.clone()];
    let mut candidates = Vec::new();

    while let Some(element) = stack.pop() {
        if scan_budget == 0 {
            break;
        }
        scan_budget -= 1;

        if fingerprint_name_matches(&element, fingerprint) {
            candidates.push(element.clone());
        }

        let Some(children) = walker.get_children(&element) else {
            continue;
        };
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }

    pick_fingerprint_candidate(fingerprint, candidates)
}

#[cfg(target_os = "windows")]
fn find_element_by_bounds_overlap(
    walker: &UITreeWalker,
    root: &UIElement,
    expected_bounds: Rect,
) -> Result<UIElement, String> {
    let mut scan_budget = WINDOWS_RESOLVE_SCAN_BUDGET;
    let mut stack = vec![root.clone()];
    let mut best: Option<(UIElement, f64)> = None;

    while let Some(element) = stack.pop() {
        if scan_budget == 0 {
            break;
        }
        scan_budget -= 1;

        if let Ok(rect) = element.get_bounding_rectangle() {
            if let Some(actual) = rect_from_uia(rect) {
                if bounds_overlap(expected_bounds, actual) {
                    let overlap_score = actual.width * actual.height;
                    if best.as_ref().map_or(0.0, |(_, score)| *score) < overlap_score {
                        best = Some((element.clone(), overlap_score));
                    }
                }
            }
        }

        let Some(children) = walker.get_children(&element) else {
            continue;
        };
        for child in children.into_iter().rev() {
            stack.push(child);
        }
    }

    best.map(|(element, _)| element).ok_or_else(|| {
        "element not found by snapshot bounds — snapshot again after UI settles".into()
    })
}

#[cfg(target_os = "windows")]
fn fingerprint_name_matches(element: &UIElement, fingerprint: &ElementFingerprint) -> bool {
    fingerprint
        .name
        .as_ref()
        .map(|name| name.trim())
        .filter(|name| !name.is_empty())
        .is_none_or(|expected| uia_name_matches(element, expected))
}

#[cfg(target_os = "windows")]
fn pick_fingerprint_candidate(
    fingerprint: &ElementFingerprint,
    mut candidates: Vec<UIElement>,
) -> Result<UIElement, String> {
    if candidates.is_empty() {
        return Err("no candidates".into());
    }

    if let Some(expected_bounds) = fingerprint.bounds {
        if let Some(best) = candidates.iter().find(|candidate| {
            candidate
                .get_bounding_rectangle()
                .ok()
                .is_some_and(|rect| bounds_near(expected_bounds, &rect))
        }) {
            return Ok(best.clone());
        }
    }

    if candidates.len() == 1 {
        return Ok(candidates.remove(0));
    }

    Err(format!(
        "ambiguous element match for {:?}",
        fingerprint.name
    ))
}

#[cfg(target_os = "windows")]
fn resolve_uia_element_at_bounds(
    automation: &UIAutomation,
    fingerprint: &ElementFingerprint,
    bounds: Rect,
) -> Result<UIElement, String> {
    let (cx, cy) = bounds_center(bounds);
    let element = automation
        .element_from_point(UiaPoint::new(cx, cy))
        .map_err(|error| format!("element_from_point at snapshot bounds failed: {error}"))?;

    if fingerprint_name_matches(&element, fingerprint) {
        return Ok(element);
    }

    if let Ok(control_type) = element.get_control_type() {
        if control_type == fingerprint.control_type {
            return Ok(element);
        }
    }

    if let Some(expected_bounds) = fingerprint.bounds {
        if element
            .get_bounding_rectangle()
            .ok()
            .and_then(|rect| rect_from_uia(rect))
            .is_some_and(|actual| bounds_overlap(expected_bounds, actual))
        {
            return Ok(element);
        }
    }

    Ok(element)
}

#[cfg(target_os = "windows")]
fn resolve_uia_element(
    automation: &UIAutomation,
    app: &AppTarget,
    anchor: &SnapshotAnchor,
    fingerprint: &ElementFingerprint,
) -> Result<UIElement, String> {
    let hwnd = find_windows_hwnd(app)?;
    if anchor.hwnd != hwnd.0 as isize {
        return Err(
            "target window changed since snapshot — take a fresh ui_a11y_snapshot".into(),
        );
    }
    let browser = is_browser_context(app, hwnd);
    let window = automation
        .element_from_handle(Handle::from(hwnd))
        .map_err(|error| format!("ElementFromHandle failed: {error}"))?;
    let walker = automation
        .get_control_view_walker()
        .map_err(|error| format!("ControlViewWalker failed: {error}"))?;
    let search_root = if browser {
        find_browser_document_root(&walker, &window, anchor.document_bounds).unwrap_or(window)
    } else {
        window
    };

    match find_element_by_fingerprint(&walker, &search_root, fingerprint) {
        Ok(element) => Ok(element),
        Err(primary_error) => {
            if let Some(bounds) = fingerprint.bounds {
                resolve_uia_element_at_bounds(automation, fingerprint, bounds).map_err(|fallback| {
                    format!("{primary_error}; bounds fallback failed: {fallback}")
                })
            } else {
                Err(primary_error)
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn wait_for_ui_settle() {
    std::thread::sleep(std::time::Duration::from_millis(UI_ACTION_SETTLE_MS));
}

#[cfg(target_os = "windows")]
fn role_from_control_type(control_type: ControlType) -> Role {
    match control_type {
        ControlType::Button => Role::Button,
        ControlType::Calendar => Role::Calendar,
        ControlType::CheckBox => Role::CheckBox,
        ControlType::ComboBox => Role::ComboBox,
        ControlType::Edit => Role::TextField,
        ControlType::Hyperlink => Role::Link,
        ControlType::Image => Role::Image,
        ControlType::ListItem | ControlType::DataItem => Role::Cell,
        ControlType::List => Role::List,
        ControlType::Menu => Role::Menu,
        ControlType::MenuBar => Role::MenuBar,
        ControlType::MenuItem => Role::MenuItem,
        ControlType::ProgressBar => Role::ProgressIndicator,
        ControlType::RadioButton => Role::RadioButton,
        ControlType::ScrollBar => Role::ScrollBar,
        ControlType::Slider => Role::Slider,
        ControlType::Spinner => Role::Incrementor,
        ControlType::StatusBar
        | ControlType::Text
        | ControlType::HeaderItem
        | ControlType::TitleBar => Role::StaticText,
        ControlType::Tab => Role::TabGroup,
        ControlType::TabItem => Role::Tab,
        ControlType::ToolBar => Role::Toolbar,
        ControlType::Tree => Role::Outline,
        ControlType::TreeItem => Role::TreeItem,
        ControlType::Group | ControlType::Pane | ControlType::Header => Role::Group,
        ControlType::DataGrid | ControlType::Table => Role::Table,
        ControlType::Document => Role::TextArea,
        ControlType::SplitButton => Role::MenuButton,
        ControlType::Window => Role::Window,
        ControlType::ToolTip
        | ControlType::Custom
        | ControlType::Thumb
        | ControlType::Separator
        | ControlType::SemanticZoom
        | ControlType::AppBar => Role::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn rect_from_uia(rect: uiautomation::types::Rect) -> Option<Rect> {
    let width = rect.get_right() - rect.get_left();
    let height = rect.get_bottom() - rect.get_top();
    if width <= 0 || height <= 0 {
        return None;
    }
    Some(Rect::new(
        f64::from(rect.get_left()),
        f64::from(rect.get_top()),
        f64::from(width),
        f64::from(height),
    ))
}

#[cfg(target_os = "windows")]
fn node_from_uia(element: &UIElement) -> ElementNode {
    let control_type = element
        .get_control_type()
        .unwrap_or(ControlType::Custom);
    let role = role_from_control_type(control_type);
    let name = element.get_name().ok().filter(|name| !name.is_empty());
    let bounds = element.get_bounding_rectangle().ok().and_then(rect_from_uia);
    let enabled = element.is_enabled().ok();
    let mut data = ElementData::new(role)
        .with_name_opt(name)
        .with_bounds_opt(bounds)
        .with_native_role(format!("uia:{control_type:?}"));
    data.enabled = enabled;
    ElementNode::new(data)
}

#[cfg(target_os = "windows")]
fn build_bounded_windows_tree(
    walker: &UITreeWalker,
    element: &UIElement,
    depth: usize,
    max_depth: usize,
    interactive_only: bool,
    remaining_nodes: &mut usize,
) -> ElementNode {
    *remaining_nodes = remaining_nodes.saturating_sub(1);
    let mut node = node_from_uia(element);
    if depth >= max_depth || *remaining_nodes == 0 {
        return node;
    }

    let Some(children) = walker.get_children(element) else {
        return node;
    };
    for child in children {
        if *remaining_nodes == 0 {
            break;
        }
        if !should_descend_uia(&child, interactive_only) {
            continue;
        }
        node.add_child(build_bounded_windows_tree(
            walker,
            &child,
            depth + 1,
            max_depth,
            interactive_only,
            remaining_nodes,
        ));
    }
    node
}

#[cfg(target_os = "windows")]
fn windows_snapshot_tree(
    automation: &UIAutomation,
    app: &AppTarget,
    options: &SnapshotOptions,
) -> Result<(ElementTree, bool, bool, SnapshotAnchor), String> {
    let hwnd = find_windows_hwnd(app)?;
    let browser = is_browser_context(app, hwnd);
    let window_element = automation
        .element_from_handle(Handle::from(hwnd))
        .map_err(|e| format!("ElementFromHandle failed: {e}"))?;
    let walker = automation
        .get_control_view_walker()
        .map_err(|e| format!("ControlViewWalker failed: {e}"))?;
    let (root_element, scoped_document) = if browser {
        match find_browser_document_root(&walker, &window_element, None) {
            Some(document) => (document, true),
            None => (window_element, false),
        }
    } else {
        (window_element.clone(), false)
    };
    let document_bounds = if scoped_document {
        root_element
            .get_bounding_rectangle()
            .ok()
            .and_then(rect_from_uia)
    } else {
        None
    };
    let anchor = SnapshotAnchor {
        hwnd: hwnd.0 as isize,
        document_bounds,
    };
    let mut remaining_nodes = WINDOWS_UIA_NODE_BUDGET;
    let root = build_bounded_windows_tree(
        &walker,
        &root_element,
        0,
        options.max_depth,
        options.interactive_only,
        &mut remaining_nodes,
    );
    let truncated = remaining_nodes == 0;
    let assigned = RefAssigner::new().assign(&root, options.interactive_only);
    let tree = ElementTree {
        app: app.display(),
        root: assigned.root,
        refs: assigned.refs,
        window_bounds: None,
        timing: None,
    };
    Ok((tree, truncated, scoped_document, anchor))
}

#[cfg(target_os = "macos")]
fn foreground_app_target() -> Result<AppTarget, String> {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication().ok_or("no foreground application")?;
    let name = app.localizedName().map(|n| n.to_string()).unwrap_or_default();
    if name.is_empty() {
        return Err("foreground application has no name".into());
    }
    Ok(AppTarget::Name(name))
}

#[cfg(target_os = "linux")]
fn foreground_app_target() -> Result<AppTarget, String> {
    let provider = create_provider();
    let apps = provider
        .list_apps()
        .map_err(|e| e.to_string())?;
    let app = apps
        .into_iter()
        .find(|info| info.focused)
        .or_else(|| {
            provider
                .list_apps()
                .ok()?
                .into_iter()
                .next()
        })
        .ok_or_else(|| "no focused application in accessibility registry".to_string())?;
    if let Some(pid) = app.pid {
        Ok(AppTarget::Pid(pid))
    } else {
        Ok(AppTarget::Name(app.name))
    }
}

fn resolve_app_target(request: &UiA11ySnapshotRequest) -> Result<AppTarget, String> {
    if let Some(name) = request
        .app_name
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        return Ok(AppTarget::Name(name.to_string()));
    }
    if request.foreground_only.unwrap_or(true) {
        return foreground_app_target();
    }
    Err("app_name is required when foreground_only is false".into())
}

#[cfg(not(target_os = "windows"))]
fn find_node_by_ref<'a>(node: &'a ElementNode, target: ElementRef) -> Option<&'a ElementNode> {
    if node.data.reference == Some(target) {
        return Some(node);
    }
    for child in &node.children {
        if let Some(found) = find_node_by_ref(child, target) {
            return Some(found);
        }
    }
    None
}

fn count_nodes(node: &ElementNode) -> u32 {
    1 + node
        .children
        .iter()
        .map(count_nodes)
        .fold(0u32, u32::saturating_add)
}

fn collect_interactive_refs(node: &ElementNode, out: &mut Vec<UiA11yInteractiveRef>) {
    if out.len() >= MAX_INTERACTIVE_SUMMARY {
        return;
    }
    if let Some(reference) = node.data.reference {
        out.push(UiA11yInteractiveRef {
            id: reference.to_string(),
            role: node.data.role.to_lowercase(),
            name: node.data.name.clone(),
            value: node.data.value.clone(),
            enabled: node.data.enabled.unwrap_or(true),
        });
    }
    for child in &node.children {
        collect_interactive_refs(child, out);
    }
}

fn parse_element_ref(raw: &str) -> Result<ElementRef, String> {
    let trimmed = raw.trim();
    ElementRef::parse(trimmed).ok_or_else(|| {
        format!("element_id must look like @e3 (got {trimmed})")
    })
}

fn parse_action(raw: &str) -> Result<&'static str, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "click" => Ok("click"),
        "double_click" | "doubleclick" => Ok("double_click"),
        "set_value" | "setvalue" | "type" => Ok("set_value"),
        "focus" => Ok("focus"),
        other => Err(format!(
            "unsupported action {other}; use click, double_click, set_value, or focus"
        )),
    }
}

#[cfg(target_os = "windows")]
fn windows_perform_uia_action(
    element: &UIElement,
    action: &str,
    text: Option<&str>,
    click_count: u8,
) -> Result<String, String> {
    let label = element
        .get_name()
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "control".to_string());

    match action {
        "click" | "double_click" => {
            let effective_count = if action == "double_click" { 2 } else { click_count };
            if effective_count >= 2 {
                if let Ok(pattern) = element.get_pattern::<UIInvokePattern>() {
                    pattern
                        .invoke()
                        .map_err(|error| format!("Invoke failed: {error}"))?;
                    wait_for_ui_settle();
                    return Ok(format!("invoked {label}"));
                }
                element
                    .double_click()
                    .map_err(|error| format!("double_click failed: {error}"))?;
                wait_for_ui_settle();
                return Ok(format!("double-clicked {label}"));
            }
            if let Ok(pattern) = element.get_pattern::<UIInvokePattern>() {
                pattern
                    .invoke()
                    .map_err(|error| format!("Invoke failed: {error}"))?;
                wait_for_ui_settle();
                return Ok(format!("invoked {label}"));
            }
            if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
                pattern
                    .do_default_action()
                    .map_err(|error| format!("LegacyIAccessible.DoDefaultAction failed: {error}"))?;
                wait_for_ui_settle();
                return Ok(format!("default action on {label}"));
            }
            element
                .click()
                .map_err(|error| format!("click failed: {error}"))?;
            wait_for_ui_settle();
            Ok(format!("clicked {label}"))
        }
        "set_value" => {
            let value = text.ok_or("text is required for set_value")?;
            if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
                pattern
                    .set_value(value)
                    .map_err(|error| format!("ValuePattern.set_value failed: {error}"))?;
                wait_for_ui_settle();
                return Ok(format!("set value on {label}"));
            }
            if let Ok(pattern) = element.get_pattern::<UILegacyIAccessiblePattern>() {
                pattern
                    .set_value(value)
                    .map_err(|error| format!("LegacyIAccessible.SetValue failed: {error}"))?;
                wait_for_ui_settle();
                return Ok(format!("set value on {label}"));
            }
            element
                .set_focus()
                .map_err(|error| format!("focus failed: {error}"))?;
            type_text_enigo(value)?;
            wait_for_ui_settle();
            Ok(format!("typed into {label}"))
        }
        "focus" => {
            element
                .set_focus()
                .map_err(|error| format!("set_focus failed: {error}"))?;
            wait_for_ui_settle();
            Ok(format!("focused {label}"))
        }
        _ => Err("unsupported action".into()),
    }
}


#[cfg(not(target_os = "windows"))]
fn click_bounds_enigo(bounds: forepaw::core::types::Rect, click_count: u8) -> Result<(), String> {
    use enigo::{Button, Coordinate, Direction};

    let cx = (bounds.x + bounds.width / 2.0).round() as i32;
    let cy = (bounds.y + bounds.height / 2.0).round() as i32;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(cx, cy, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    let count = if click_count >= 2 { 2 } else { 1 };
    for _ in 0..count {
        enigo
            .button(Button::Left, Direction::Click)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn type_text_enigo(text: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(text).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn interact_with_node(
    _app: &AppTarget,
    node: &ElementNode,
    action: &str,
    text: Option<&str>,
    click_count: u8,
) -> Result<String, String> {
    let bounds = node
        .data
        .bounds
        .ok_or("element has no on-screen bounds; try display_capture")?;
    let label = node
        .data
        .name
        .clone()
        .unwrap_or_else(|| node.data.role.to_lowercase());

    #[cfg(target_os = "macos")]
    {
        use forepaw::core::key_combo::ClickOptions;

        let provider = create_provider();
        if let Some(reference) = node.data.reference {
            match action {
                "click" | "double_click" => {
                    let options = ClickOptions {
                        click_count: if action == "double_click" || click_count >= 2 {
                            2
                        } else {
                            1
                        },
                        ..ClickOptions::default()
                    };
                    let result = provider
                        .click_ref(reference, _app, &options)
                        .map_err(|e| e.to_string())?;
                    return Ok(result.message);
                }
                "set_value" => {
                    let value = text.ok_or("text is required for set_value")?;
                    let result = provider
                        .type_ref(reference, value, _app)
                        .map_err(|e| e.to_string())?;
                    return Ok(result.message);
                }
                "focus" => {
                    let result = provider
                        .hover_ref(reference, _app)
                        .map_err(|e| e.to_string())?;
                    return Ok(result.message);
                }
                _ => {}
            }
        }
    }

    match action {
        "click" | "double_click" => {
            let effective_count = if action == "double_click" { 2 } else { click_count };
            click_bounds_enigo(bounds, effective_count)?;
            Ok(format!(
                "{} on {label}",
                if effective_count >= 2 {
                    "double-clicked"
                } else {
                    "clicked"
                }
            ))
        }
        "set_value" => {
            let value = text.ok_or("text is required for set_value")?;
            click_bounds_enigo(bounds, 1)?;
            type_text_enigo(value)?;
            Ok(format!("set value on {label}"))
        }
        "focus" => {
            click_bounds_enigo(bounds, 1)?;
            Ok(format!("focused {label}"))
        }
        _ => Err("unsupported action".into()),
    }
}

#[tauri::command]
pub fn ui_a11y_snapshot(request: UiA11ySnapshotRequest) -> Result<UiA11ySnapshotResponse, String> {
    #[cfg(target_os = "windows")]
    {
        return run_windows_uia(move || ui_a11y_snapshot_impl(request));
    }

    #[cfg(not(target_os = "windows"))]
    {
        ui_a11y_snapshot_impl(request)
    }
}

fn ui_a11y_snapshot_impl(
    request: UiA11ySnapshotRequest,
) -> Result<UiA11ySnapshotResponse, String> {
    let provider = create_provider();
    if !provider.has_permissions() {
        return Err(
            "accessibility permission not granted — enable Accessibility for Actuate in system settings"
                .into(),
        );
    }

    let app = resolve_app_target(&request)?;
    let max_depth = request
        .max_depth
        .map(|d| d as usize)
        .unwrap_or(DEFAULT_MAX_DEPTH)
        .clamp(4, 20);

    #[cfg(target_os = "windows")]
    let (interactive_only, automation, browser) = {
        let automation = windows_automation()?;
        let hwnd = find_windows_hwnd(&app)?;
        let browser = is_browser_context(&app, hwnd);
        let interactive_only = request.interactive_only.unwrap_or(browser);
        (interactive_only, automation, browser)
    };
    #[cfg(not(target_os = "windows"))]
    let interactive_only = request.interactive_only.unwrap_or(false);

    let options = SnapshotOptions {
        interactive_only,
        max_depth,
        compact: true,
        skip_menu_bar: true,
        skip_zero_size: true,
        skip_offscreen: true,
        ..SnapshotOptions::default()
    };

    #[cfg(target_os = "windows")]
    let (tree, truncated_by_budget, scoped_document, anchor) =
        windows_snapshot_tree(&automation, &app, &options)?;

    #[cfg(not(target_os = "windows"))]
    let (tree, truncated_by_budget, scoped_document) = (
        provider
            .snapshot(&app, None::<&WindowTarget>, &options)
            .map_err(|e| e.to_string())?,
        false,
        false,
    );

    let element_count = count_nodes(&tree.root);
    let mut interactive_refs = Vec::new();
    collect_interactive_refs(&tree.root, &mut interactive_refs);
    let interactive_count = interactive_refs.len() as u32;
    let truncated = truncated_by_budget || interactive_refs.len() >= MAX_INTERACTIVE_SUMMARY;
    let tree_text = TreeRenderer::new(false).render(&tree);

    {
        let mut cache = session_cache()
            .lock()
            .map_err(|_| "accessibility cache lock poisoned".to_string())?;
        #[cfg(target_os = "windows")]
        let mut fingerprints = HashMap::new();
        #[cfg(target_os = "windows")]
        collect_fingerprints(&tree.root, &mut fingerprints);
        *cache = Some(CachedSnapshot {
            app: app.clone(),
            tree: tree.clone(),
            #[cfg(target_os = "windows")]
            fingerprints,
            #[cfg(target_os = "windows")]
            anchor,
        });
    }

    #[cfg(target_os = "windows")]
    let browser_hint = if browser {
        if scoped_document {
            " Browser tab scoped to Document root with interactive_only filtering."
        } else {
            " Browser detected but tab Document not found yet — retry snapshot after load; ensure --force-renderer-accessibility."
        }
    } else {
        ""
    };
    #[cfg(not(target_os = "windows"))]
    let browser_hint = "";

    Ok(UiA11ySnapshotResponse {
        platform: platform_label().to_string(),
        app: tree.app.clone(),
        element_count,
        interactive_count,
        truncated,
        tree_text,
        interactive_refs,
        next_step: format!(
            "Pick an element id (@eN) from interactive_refs or tree_text, then ui_a11y_interact — do not call ui_a11y_snapshot again unless the UI changed.{browser_hint} Use display_capture only if the tree is empty or interaction failed."
        ),
    })
}

#[tauri::command]
pub fn ui_a11y_interact(request: UiA11yInteractRequest) -> Result<UiA11yInteractResponse, String> {
    #[cfg(target_os = "windows")]
    {
        return run_windows_uia(move || ui_a11y_interact_impl(request));
    }

    #[cfg(not(target_os = "windows"))]
    {
        ui_a11y_interact_impl(request)
    }
}

fn ui_a11y_interact_impl(
    request: UiA11yInteractRequest,
) -> Result<UiA11yInteractResponse, String> {
    let element_ref = parse_element_ref(&request.element_id)?;
    let action = parse_action(&request.action)?;
    let click_count = request.click_count.unwrap_or(1);

    let interact_result: Result<String, String> = (|| {
        let cache = session_cache()
            .lock()
            .map_err(|_| "accessibility cache lock poisoned".to_string())?;
        let cached = cache
            .as_ref()
            .ok_or("no accessibility snapshot in this session — call ui_a11y_snapshot first")?;

        #[cfg(target_os = "windows")]
        {
            let fingerprint = cached
                .fingerprints
                .get(&element_ref)
                .ok_or_else(|| {
                    format!(
                        "element {} not found in latest snapshot — snapshot again",
                        request.element_id
                    )
                })?
                .clone();
            let app = cached.app.clone();
            let anchor = cached.anchor.clone();
            drop(cache);
            let automation = windows_automation()?;
            let element = resolve_uia_element(&automation, &app, &anchor, &fingerprint)?;
            windows_perform_uia_action(&element, action, request.text.as_deref(), click_count)
        }

        #[cfg(not(target_os = "windows"))]
        {
            let node = find_node_by_ref(&cached.tree.root, element_ref).ok_or_else(|| {
                format!(
                    "element {} not found in latest snapshot",
                    request.element_id
                )
            })?;
            let app = cached.app.clone();
            let node = node.clone();
            drop(cache);
            interact_with_node(&app, &node, action, request.text.as_deref(), click_count)
        }
    })();

    if interact_result.is_err() {
        clear_session_cache();
    }

    let message = interact_result?;

    Ok(UiA11yInteractResponse {
        action: action.to_string(),
        element_id: element_ref.to_string(),
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_element_ref_accepts_at_e_format() {
        let parsed = parse_element_ref("@e12").unwrap();
        assert_eq!(parsed, ElementRef::new(12));
    }

    #[test]
    fn parse_action_normalizes_aliases() {
        assert_eq!(parse_action("doubleclick").unwrap(), "double_click");
        assert_eq!(parse_action("setValue").unwrap(), "set_value");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn is_browser_app_detects_chrome_and_edge() {
        assert!(is_browser_app(&AppTarget::Name("Google Chrome".into())));
        assert!(is_browser_app(&AppTarget::Name("Microsoft Edge".into())));
        assert!(is_browser_app(&AppTarget::Name("Gmail".into())));
        assert!(!is_browser_app(&AppTarget::Name("Notepad".into())));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn bounds_overlap_requires_major_intersection() {
        let expected = Rect::new(100.0, 100.0, 40.0, 20.0);
        assert!(bounds_overlap(expected, Rect::new(105.0, 102.0, 30.0, 16.0)));
        assert!(!bounds_overlap(expected, Rect::new(200.0, 200.0, 10.0, 10.0)));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parse_uia_control_type_label_maps_edit() {
        assert_eq!(
            parse_uia_control_type_label("Edit"),
            Some(ControlType::Edit)
        );
    }
}
