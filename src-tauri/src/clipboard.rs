//! OS clipboard read/write and paste-into-focused-app (Ctrl/Cmd+V).

use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReadResponse {
    pub text: String,
}

#[tauri::command]
pub fn clipboard_read_text() -> Result<ClipboardReadResponse, String> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("clipboard unavailable: {e}"))?;
    let text = clipboard
        .get_text()
        .map_err(|e| format!("clipboard read failed: {e}"))?;
    Ok(ClipboardReadResponse { text })
}

#[tauri::command]
pub fn clipboard_write_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| format!("clipboard unavailable: {e}"))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("clipboard write failed: {e}"))
}

#[tauri::command]
pub fn clipboard_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    paste_shortcut(&mut enigo)
}

fn paste_shortcut(enigo: &mut Enigo) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Direction::Press)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Meta, Direction::Release)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Unicode('v'), Direction::Click)
            .map_err(|e| e.to_string())?;
        enigo
            .key(Key::Control, Direction::Release)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
