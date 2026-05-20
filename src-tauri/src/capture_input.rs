use base64::{engine::general_purpose::STANDARD, Engine as _};
#[cfg(not(target_os = "windows"))]
use enigo::Coordinate;
use enigo::{Button, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use screenshots::image::{DynamicImage, ImageFormat};
use screenshots::Screen;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::cursor_overlay;
use crate::mouse_hook::{self, MouseSwallowGuard};

fn capture_serial_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Post-hide wait on platforms without DWM (macOS/Linux).

#[cfg(target_os = "windows")]
fn wait_for_desktop_paint_after_hide() {
    // Two flush + sleep passes: WebView2 / DWM often need more than one frame to drop
    // the window from the composed desktop (especially on back-to-back captures).
    unsafe {
        let _ = windows::Win32::Graphics::Dwm::DwmFlush();
    }
    std::thread::sleep(Duration::from_millis(96));
    unsafe {
        let _ = windows::Win32::Graphics::Dwm::DwmFlush();
    }
    std::thread::sleep(Duration::from_millis(48));
}

#[cfg(not(target_os = "windows"))]
fn wait_for_desktop_paint_after_hide() {
    std::thread::sleep(Duration::from_millis(120));
}

static POINTER_CANCEL: AtomicBool = AtomicBool::new(false);

fn pointer_cancel_requested() -> bool {
    POINTER_CANCEL.load(Ordering::Acquire)
}

#[tauri::command]
pub fn reset_pointer_automation_cancel() -> Result<(), String> {
    POINTER_CANCEL.store(false, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub fn cancel_pointer_automation() -> Result<(), String> {
    POINTER_CANCEL.store(true, Ordering::Release);
    Ok(())
}

fn capture_primary_display_png_base64_inner() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .first()
        .ok_or_else(|| "no displays found".to_string())?;
    let mut rgba = screen.capture().map_err(|e| e.to_string())?;
    cursor_overlay::composite_cursor_into_rgba(&mut rgba, &screen.display_info)?;
    let image = DynamicImage::ImageRgba8(rgba);
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(png_bytes))
}

/// Samples the primary display after briefly hiding the main window so captured pixels match
/// what lies underneath Actuate (minimal flicker).
///
/// Serialized globally so overlapping IPC calls cannot interleave hide/show with capture (which
/// produced stale frames where Actuate still appeared).
#[tauri::command]
pub fn capture_primary_display_png_base64(app: AppHandle) -> Result<String, String> {
    let _serial = capture_serial_lock()
        .lock()
        .map_err(|_| "screen capture lock poisoned".to_string())?;

    let mut hid_main_for_capture = false;
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && w.hide().is_ok() {
            hid_main_for_capture = true;
            wait_for_desktop_paint_after_hide();
        }
    }

    let png_b64 = capture_primary_display_png_base64_inner();

    if hid_main_for_capture {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
        }
        #[cfg(target_os = "windows")]
        std::thread::sleep(Duration::from_millis(32));
        #[cfg(not(target_os = "windows"))]
        std::thread::sleep(Duration::from_millis(48));
    }

    png_b64
}

fn parse_mouse_button(name: &str) -> Result<Button, String> {
    match name.to_lowercase().as_str() {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        _ => Err(format!(
            "invalid button {name:?}; expected left, right, or middle"
        )),
    }
}

fn sleep_step_cancel_aware(step_ms: u64) {
    std::thread::sleep(Duration::from_millis(step_ms));
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PointerBounds {
    min_x: i32,
    max_x: i32,
    min_y: i32,
    max_y: i32,
}

fn pointer_bounds_from_display(
    display_info: &screenshots::display_info::DisplayInfo,
) -> PointerBounds {
    let width_offset = i32::try_from(display_info.width.saturating_sub(1)).unwrap_or(i32::MAX);
    let height_offset = i32::try_from(display_info.height.saturating_sub(1)).unwrap_or(i32::MAX);

    PointerBounds {
        min_x: display_info.x,
        max_x: display_info.x.saturating_add(width_offset),
        min_y: display_info.y,
        max_y: display_info.y.saturating_add(height_offset),
    }
}

fn clamp_pointer_target(x: i32, y: i32, bounds: PointerBounds) -> (i32, i32) {
    (
        x.clamp(bounds.min_x, bounds.max_x),
        y.clamp(bounds.min_y, bounds.max_y),
    )
}

fn clamp_pointer_target_to_primary_display(x: i32, y: i32) -> Result<(i32, i32), String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let Some(screen) = screens.first() else {
        return Ok((x, y));
    };
    Ok(clamp_pointer_target(
        x,
        y,
        pointer_bounds_from_display(&screen.display_info),
    ))
}

/// Windows: `SetCursorPos` in small steps (virtual screen pixels). Does not enable mouse swallow —
/// swallowing low-level mouse messages can interfere with seeing the cursor move reliably.
/// Other OS: enigo absolute move in steps from current position.
#[tauri::command]
pub fn pointer_move_to(x: i32, y: i32) -> Result<(), String> {
    POINTER_CANCEL.store(false, Ordering::Release);
    let (x, y) = clamp_pointer_target_to_primary_display(x, y)?;

    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let (sx, sy) = mouse_hook::cursor_position()?;
        let dx = x - sx;
        let dy = y - sy;
        let dist_sq = (dx as i64) * (dx as i64) + (dy as i64) * (dy as i64);
        let dist = (dist_sq as f64).sqrt();
        let steps = ((dist / 8.0).ceil() as i32).clamp(10, 600);

        for i in 1..=steps {
            if pointer_cancel_requested() {
                return Err("Pointer automation cancelled.".to_string());
            }
            let t = i as f64 / steps as f64;
            let nx = sx + ((dx as f64) * t).round() as i32;
            let ny = sy + ((dy as f64) * t).round() as i32;
            mouse_hook::set_cursor_position(nx, ny)?;
            sleep_step_cancel_aware(2);
        }
        mouse_hook::set_cursor_position(x, y)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        let (sx, sy) = enigo
            .location()
            .map_err(|e| format!("mouse location: {e}"))?;
        let dx = x - sx;
        let dy = y - sy;
        let dist_sq = (dx as i64) * (dx as i64) + (dy as i64) * (dy as i64);
        let dist = (dist_sq as f64).sqrt();
        let steps = ((dist / 8.0).ceil() as i32).clamp(10, 600);
        for i in 1..=steps {
            if pointer_cancel_requested() {
                return Err("Pointer automation cancelled.".to_string());
            }
            let t = i as f64 / steps as f64;
            let nx = sx + ((dx as f64) * t).round() as i32;
            let ny = sy + ((dy as f64) * t).round() as i32;
            enigo
                .move_mouse(nx, ny, Coordinate::Abs)
                .map_err(|e| e.to_string())?;
            sleep_step_cancel_aware(2);
        }
        enigo
            .move_mouse(x, y, Coordinate::Abs)
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn pointer_click(button: String) -> Result<(), String> {
    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }

    let _swallow = MouseSwallowGuard::enter();

    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let b = parse_mouse_button(&button)?;
    enigo
        .button(b, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn type_text(text: String) -> Result<(), String> {
    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&text).map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_logical_key(name: &str) -> Result<Key, String> {
    match name.to_lowercase().as_str() {
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "backspace" => Ok(Key::Backspace),
        _ => Err(format!(
            "invalid key {name:?}; expected enter, tab, escape, backspace"
        )),
    }
}

/// Synthesize a single key press (click) for focus/navigation. Use `enter` to submit many prompts.
#[tauri::command]
pub fn key_tap(key: String) -> Result<(), String> {
    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let k = parse_logical_key(&key)?;
    enigo.key(k, Direction::Click).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{clamp_pointer_target, parse_logical_key, parse_mouse_button, PointerBounds};
    use enigo::{Button, Key};

    #[test]
    fn parse_mouse_button_maps_supported_buttons() {
        assert_eq!(
            parse_mouse_button("left").expect("left button"),
            Button::Left
        );
        assert_eq!(
            parse_mouse_button("RIGHT").expect("right button"),
            Button::Right
        );
        assert_eq!(
            parse_mouse_button("middle").expect("middle button"),
            Button::Middle
        );
    }

    #[test]
    fn parse_mouse_button_rejects_unknown_button() {
        let err = parse_mouse_button("side").expect_err("side is unsupported");

        assert!(err.contains("expected left, right, or middle"));
    }

    #[test]
    fn parse_logical_key_maps_supported_aliases() {
        assert_eq!(parse_logical_key("enter").expect("enter key"), Key::Return);
        assert_eq!(
            parse_logical_key("return").expect("return key"),
            Key::Return
        );
        assert_eq!(parse_logical_key("tab").expect("tab key"), Key::Tab);
        assert_eq!(
            parse_logical_key("escape").expect("escape key"),
            Key::Escape
        );
        assert_eq!(parse_logical_key("esc").expect("esc key"), Key::Escape);
        assert_eq!(
            parse_logical_key("backspace").expect("backspace key"),
            Key::Backspace
        );
    }

    #[test]
    fn parse_logical_key_rejects_unknown_key() {
        let err = parse_logical_key("space").expect_err("space is unsupported");

        assert!(err.contains("expected enter, tab, escape, backspace"));
    }

    #[test]
    fn clamp_pointer_target_clamps_to_bounds() {
        let bounds = PointerBounds {
            min_x: -10,
            max_x: 100,
            min_y: 20,
            max_y: 80,
        };

        assert_eq!(clamp_pointer_target(-20, 120, bounds), (-10, 80));
        assert_eq!(clamp_pointer_target(50, 40, bounds), (50, 40));
        assert_eq!(clamp_pointer_target(200, -100, bounds), (100, 20));
    }
}
