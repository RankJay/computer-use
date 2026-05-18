use base64::{engine::general_purpose::STANDARD, Engine as _};
use enigo::{Button, Direction, Enigo, Key, Keyboard, Mouse, Settings};
#[cfg(not(target_os = "windows"))]
use enigo::Coordinate;
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

/// Windows: `SetCursorPos` in small steps (virtual screen pixels). Does not enable mouse swallow —
/// swallowing low-level mouse messages can interfere with seeing the cursor move reliably.
/// Other OS: enigo absolute move in steps from current position.
#[tauri::command]
pub fn pointer_move_to(x: i32, y: i32) -> Result<(), String> {
    POINTER_CANCEL.store(false, Ordering::Release);

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
        let (sx, sy) = enigo.location().map_err(|e| format!("mouse location: {e}"))?;
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
