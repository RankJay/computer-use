use base64::{engine::general_purpose::STANDARD, Engine as _};
use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use screenshots::image::{DynamicImage, ImageFormat};
use screenshots::Screen;
use std::io::Cursor;

#[tauri::command]
pub fn capture_primary_display_png_base64() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .first()
        .ok_or_else(|| "no displays found".to_string())?;
    let rgba = screen.capture().map_err(|e| e.to_string())?;
    let image = DynamicImage::ImageRgba8(rgba);
    let mut png_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut png_bytes);
    image
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(png_bytes))
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

#[tauri::command]
pub fn pointer_move_to(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pointer_click(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let b = parse_mouse_button(&button)?;
    enigo
        .button(b, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn type_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&text).map_err(|e| e.to_string())?;
    Ok(())
}
