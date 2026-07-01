//! Native accessibility tree snapshot and element interaction.
//!
//! Snapshots use forepaw (UIA / AX / AT-SPI). Clicks and typing use forepaw on macOS,
//! UI Automation on Windows, and Enigo pointer/keyboard on Linux when forepaw actions are stubs.

use std::sync::{Mutex, OnceLock};

use enigo::{Enigo, Keyboard, Mouse, Settings};
use forepaw::core::element_tree::{ElementNode, ElementRef, ElementTree};
use forepaw::core::tree_renderer::TreeRenderer;
use forepaw::platform::{AppTarget, DesktopProvider, SnapshotOptions, WindowTarget};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use forepaw::platform::windows::WindowsProvider as PlatformProvider;
#[cfg(target_os = "macos")]
use forepaw::platform::darwin::DarwinProvider as PlatformProvider;
#[cfg(target_os = "linux")]
use forepaw::platform::linux::LinuxProvider as PlatformProvider;

#[cfg(target_os = "windows")]
use uiautomation::patterns::UIValuePattern;
#[cfg(target_os = "windows")]
use uiautomation::types::Point as UiaPoint;
#[cfg(target_os = "windows")]
use uiautomation::UIAutomation;

const DEFAULT_MAX_DEPTH: usize = 12;
const MAX_INTERACTIVE_SUMMARY: usize = 80;

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

struct CachedSnapshot {
    app: AppTarget,
    tree: ElementTree,
}

fn session_cache() -> &'static Mutex<Option<CachedSnapshot>> {
    static CACHE: OnceLock<Mutex<Option<CachedSnapshot>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
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
fn windows_click_at(bounds: forepaw::core::types::Rect, click_count: u8) -> Result<(), String> {
    let automation =
        UIAutomation::new().map_err(|e| format!("UI Automation init failed: {e}"))?;
    let cx = (bounds.x + bounds.width / 2.0).round() as i32;
    let cy = (bounds.y + bounds.height / 2.0).round() as i32;
    let element = automation
        .element_from_point(UiaPoint::new(cx, cy))
        .map_err(|e| format!("element_from_point failed: {e}"))?;
    if click_count >= 2 {
        element
            .double_click()
            .map_err(|e| format!("double_click failed: {e}"))?;
    } else {
        element
            .click()
            .map_err(|e| format!("click failed: {e}"))?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_set_value(bounds: forepaw::core::types::Rect, text: &str) -> Result<(), String> {
    let automation =
        UIAutomation::new().map_err(|e| format!("UI Automation init failed: {e}"))?;
    let cx = (bounds.x + bounds.width / 2.0).round() as i32;
    let cy = (bounds.y + bounds.height / 2.0).round() as i32;
    let element = automation
        .element_from_point(UiaPoint::new(cx, cy))
        .map_err(|e| format!("element_from_point failed: {e}"))?;
    if let Ok(pattern) = element.get_pattern::<UIValuePattern>() {
        pattern
            .set_value(text)
            .map_err(|e| format!("ValuePattern.set_value failed: {e}"))?;
        return Ok(());
    }
    element
        .click()
        .map_err(|e| format!("focus click failed: {e}"))?;
    type_text_enigo(text)
}

#[cfg(target_os = "windows")]
fn windows_focus(bounds: forepaw::core::types::Rect) -> Result<(), String> {
    let automation =
        UIAutomation::new().map_err(|e| format!("UI Automation init failed: {e}"))?;
    let cx = (bounds.x + bounds.width / 2.0).round() as i32;
    let cy = (bounds.y + bounds.height / 2.0).round() as i32;
    let element = automation
        .element_from_point(UiaPoint::new(cx, cy))
        .map_err(|e| format!("element_from_point failed: {e}"))?;
    element
        .set_focus()
        .map_err(|e| format!("set_focus failed: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn windows_click_at(_bounds: forepaw::core::types::Rect, _click_count: u8) -> Result<(), String> {
    Err("internal error: windows_click_at on non-windows".into())
}

#[cfg(not(target_os = "windows"))]
fn windows_set_value(_bounds: forepaw::core::types::Rect, _text: &str) -> Result<(), String> {
    Err("internal error: windows_set_value on non-windows".into())
}

#[cfg(not(target_os = "windows"))]
fn windows_focus(_bounds: forepaw::core::types::Rect) -> Result<(), String> {
    Err("internal error: windows_focus on non-windows".into())
}

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
            if cfg!(target_os = "windows") {
                windows_click_at(bounds, effective_count)?;
            } else {
                click_bounds_enigo(bounds, effective_count)?;
            }
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
            if cfg!(target_os = "windows") {
                windows_set_value(bounds, value)?;
            } else {
                click_bounds_enigo(bounds, 1)?;
                type_text_enigo(value)?;
            }
            Ok(format!("set value on {label}"))
        }
        "focus" => {
            if cfg!(target_os = "windows") {
                windows_focus(bounds)?;
            } else {
                click_bounds_enigo(bounds, 1)?;
            }
            Ok(format!("focused {label}"))
        }
        _ => Err("unsupported action".into()),
    }
}

#[tauri::command]
pub fn ui_a11y_snapshot(request: UiA11ySnapshotRequest) -> Result<UiA11ySnapshotResponse, String> {
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
    let options = SnapshotOptions {
        interactive_only: request.interactive_only.unwrap_or(false),
        max_depth,
        compact: true,
        skip_menu_bar: true,
        skip_zero_size: true,
        skip_offscreen: true,
        ..SnapshotOptions::default()
    };

    let tree = provider
        .snapshot(&app, None::<&WindowTarget>, &options)
        .map_err(|e| e.to_string())?;

    let element_count = count_nodes(&tree.root);
    let mut interactive_refs = Vec::new();
    collect_interactive_refs(&tree.root, &mut interactive_refs);
    let interactive_count = interactive_refs.len() as u32;
    let truncated = interactive_refs.len() >= MAX_INTERACTIVE_SUMMARY;
    let tree_text = TreeRenderer::new(false).render(&tree);

    {
        let mut cache = session_cache()
            .lock()
            .map_err(|_| "accessibility cache lock poisoned".to_string())?;
        *cache = Some(CachedSnapshot {
            app: app.clone(),
            tree: tree.clone(),
        });
    }

    Ok(UiA11ySnapshotResponse {
        platform: platform_label().to_string(),
        app: tree.app.clone(),
        element_count,
        interactive_count,
        truncated,
        tree_text,
        interactive_refs,
        next_step:
            "Pick an element id (@eN) from interactive_refs or tree_text, then ui_a11y_interact — do not call ui_a11y_snapshot again unless the UI changed. Use display_capture only if the tree is empty or interaction failed."
                .into(),
    })
}

#[tauri::command]
pub fn ui_a11y_interact(request: UiA11yInteractRequest) -> Result<UiA11yInteractResponse, String> {
    let element_ref = parse_element_ref(&request.element_id)?;
    let action = parse_action(&request.action)?;
    let click_count = request.click_count.unwrap_or(1);

    let cache = session_cache()
        .lock()
        .map_err(|_| "accessibility cache lock poisoned".to_string())?;
    let cached = cache
        .as_ref()
        .ok_or("no accessibility snapshot in this session — call ui_a11y_snapshot first")?;
    let node = find_node_by_ref(&cached.tree.root, element_ref)
        .ok_or_else(|| format!("element {} not found in latest snapshot", request.element_id))?;
    let app = cached.app.clone();
    let node = node.clone();
    drop(cache);

    let message = interact_with_node(&app, &node, action, request.text.as_deref(), click_count)?;

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
}
