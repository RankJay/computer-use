use base64::{engine::general_purpose::STANDARD, Engine as _};
#[cfg(not(target_os = "windows"))]
use enigo::Coordinate;
use enigo::{Button, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use screenshots::image::{DynamicImage, ImageFormat};
use screenshots::Screen;
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::cursor_overlay;
use crate::display_metrics::{self, CaptureMetrics};
use crate::grid_overlay;
use crate::mouse_hook;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayCaptureResponse {
    png_base64: String,
    image_width: u32,
    image_height: u32,
    display_x: i32,
    display_y: i32,
    display_width: u32,
    display_height: u32,
    scale_factor: f32,
    effective_scale_factor: f32,
    grid_cell_px: u32,
    block_columns: u32,
    block_rows: u32,
    cursor_block_x: Option<i32>,
    cursor_block_y: Option<i32>,
}

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

fn cursor_position_in_capture_pixels(
    display_info: &screenshots::display_info::DisplayInfo,
    metrics: &CaptureMetrics,
) -> Option<(i32, i32)> {
    let (cursor_x, cursor_y) = mouse_hook::cursor_position().ok()?;
    display_metrics::pointer_to_capture_pixel(cursor_x, cursor_y, display_info, metrics)
}

fn cursor_position_in_blocks(
    display_info: &screenshots::display_info::DisplayInfo,
    metrics: &CaptureMetrics,
) -> Option<(i32, i32)> {
    let (image_x, image_y) = cursor_position_in_capture_pixels(display_info, metrics)?;
    Some(grid_overlay::capture_px_to_block(image_x, image_y))
}

fn metrics_for_primary_display() -> Result<CaptureMetrics, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .first()
        .ok_or_else(|| "no displays found".to_string())?;
    Ok(display_metrics::metrics_for_pointer_move(&screen.display_info))
}

fn capture_primary_display_inner() -> Result<DisplayCaptureResponse, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .first()
        .ok_or_else(|| "no displays found".to_string())?;
    let mut rgba = screen.capture().map_err(|e| e.to_string())?;
    let image_width = rgba.width();
    let image_height = rgba.height();
    let metrics =
        display_metrics::metrics_from_capture(&screen.display_info, image_width, image_height);
    cursor_overlay::composite_cursor_into_rgba(&mut rgba, &screen.display_info, metrics.effective_scale)?;
    grid_overlay::composite_grid_overlay(&mut rgba);
    let (block_columns, block_rows) = grid_overlay::block_dimensions(image_width, image_height);
    display_metrics::remember_capture_metrics(metrics);
    let cursor_position = cursor_position_in_blocks(&screen.display_info, &metrics);
    let image = DynamicImage::ImageRgba8(rgba);
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(DisplayCaptureResponse {
        png_base64: STANDARD.encode(png_bytes),
        image_width,
        image_height,
        display_x: screen.display_info.x,
        display_y: screen.display_info.y,
        display_width: screen.display_info.width,
        display_height: screen.display_info.height,
        scale_factor: screen.display_info.scale_factor,
        effective_scale_factor: metrics.effective_scale as f32,
        grid_cell_px: grid_overlay::GRID_CELL_PX,
        block_columns,
        block_rows,
        cursor_block_x: cursor_position.map(|(x, _)| x),
        cursor_block_y: cursor_position.map(|(_, y)| y),
    })
}

/// Samples the primary display after briefly hiding the main window so captured pixels match
/// what lies underneath Actuate (minimal flicker).
///
/// Serialized globally so overlapping IPC calls cannot interleave hide/show with capture (which
/// produced stale frames where Actuate still appeared).
#[tauri::command]
pub fn capture_primary_display_png_base64(
    app: AppHandle,
) -> Result<DisplayCaptureResponse, String> {
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

    let capture = capture_primary_display_inner();

    if hid_main_for_capture {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
        }
        #[cfg(target_os = "windows")]
        std::thread::sleep(Duration::from_millis(32));
        #[cfg(not(target_os = "windows"))]
        std::thread::sleep(Duration::from_millis(48));
    }

    capture
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

fn clamp_pointer_target(x: i32, y: i32, min_x: i32, max_x: i32, min_y: i32, max_y: i32) -> (i32, i32) {
    (x.clamp(min_x, max_x), y.clamp(min_y, max_y))
}

fn block_to_pointer_target_on_primary_display(
    block_x: i32,
    block_y: i32,
) -> Result<(i32, i32), String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let Some(screen) = screens.first() else {
        let (image_x, image_y) = grid_overlay::block_center_px(block_x, block_y);
        return Ok((image_x, image_y));
    };
    let metrics = metrics_for_primary_display()?;
    let (block_columns, block_rows) =
        grid_overlay::block_dimensions(metrics.image_width, metrics.image_height);
    let (block_x, block_y) =
        grid_overlay::clamp_block(block_x, block_y, block_columns, block_rows);
    let (image_x, image_y) = grid_overlay::block_center_px(block_x, block_y);
    let (target_x, target_y) =
        display_metrics::capture_pixel_to_pointer(image_x, image_y, &screen.display_info, &metrics);
    let (min_x, min_y, max_x, max_y) = display_metrics::pointer_bounds(&screen.display_info, &metrics);
    Ok(clamp_pointer_target(target_x, target_y, min_x, max_x, min_y, max_y))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerMoveResponse {
    cursor_block_x: Option<i32>,
    cursor_block_y: Option<i32>,
}

fn cursor_position_on_primary_display() -> Result<Option<(i32, i32)>, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let Some(screen) = screens.first() else {
        return Ok(None);
    };
    let metrics = metrics_for_primary_display()?;
    Ok(cursor_position_in_blocks(&screen.display_info, &metrics))
}

/// Input is 1-based pink block indices (block 1 = top-left). Each block is 160×160 px.
#[tauri::command]
pub fn pointer_move_to(block_x: i32, block_y: i32) -> Result<PointerMoveResponse, String> {
    POINTER_CANCEL.store(false, Ordering::Release);
    let (x, y) = block_to_pointer_target_on_primary_display(block_x, block_y)?;

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
    }

    let cursor_position = cursor_position_on_primary_display()?;
    Ok(PointerMoveResponse {
        cursor_block_x: cursor_position.map(|(x, _)| x),
        cursor_block_y: cursor_position.map(|(_, y)| y),
    })
}

#[tauri::command]
pub fn pointer_click(button: String, click_count: Option<u32>) -> Result<(), String> {
    if pointer_cancel_requested() {
        return Err("Pointer automation cancelled.".to_string());
    }

    let clicks = click_count.unwrap_or(1).clamp(1, 2);
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let b = parse_mouse_button(&button)?;
    for i in 0..clicks {
        if pointer_cancel_requested() {
            return Err("Pointer automation cancelled.".to_string());
        }
        enigo
            .button(b, Direction::Click)
            .map_err(|e| e.to_string())?;
        if i + 1 < clicks {
            std::thread::sleep(Duration::from_millis(80));
        }
    }
    std::thread::sleep(Duration::from_millis(60));
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
    use super::{clamp_pointer_target, parse_logical_key, parse_mouse_button};
    use crate::display_metrics;
    use crate::grid_overlay;
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
        assert_eq!(clamp_pointer_target(-20, 120, -10, 100, 20, 80), (-10, 80));
        assert_eq!(clamp_pointer_target(50, 40, -10, 100, 20, 80), (50, 40));
        assert_eq!(clamp_pointer_target(200, -100, -10, 100, 20, 80), (100, 20));
    }

    #[test]
    fn block_center_maps_through_effective_scale_to_logical_pointer() {
        use screenshots::display_info::DisplayInfo;

        let (image_x, image_y) = grid_overlay::block_center_px(1, 3);
        assert_eq!((image_x, image_y), (80, 400));

        let display = DisplayInfo {
            id: 0,
            raw_handle: Default::default(),
            x: 0,
            y: 0,
            width: 1707,
            height: 960,
            scale_factor: 1.0,
            rotation: 0.0,
            frequency: 60.0,
            is_primary: true,
        };
        let metrics = display_metrics::metrics_from_capture(&display, 2560, 1440);
        let (tx, ty) = display_metrics::capture_pixel_to_pointer(image_x, image_y, &display, &metrics);
        assert_eq!((tx, ty), (53, 267));
    }
}
