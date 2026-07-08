use arboard::Clipboard;
use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

const MAX_CLIPBOARD_BYTES: usize = 512_000;

#[derive(Debug, Serialize)]
pub struct ReadClipboardResult {
    pub text: String,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
pub struct WriteClipboardResult {
    pub bytes: usize,
}

fn truncate_clipboard(text: String) -> String {
    if text.len() <= MAX_CLIPBOARD_BYTES {
        return text;
    }

    format!(
        "{}…\n[clipboard text truncated at {MAX_CLIPBOARD_BYTES} bytes]",
        &text[..MAX_CLIPBOARD_BYTES]
    )
}

#[tauri::command]
pub fn read_clipboard() -> Result<ReadClipboardResult, CommandError> {
    let mut clipboard = Clipboard::new().map_err(|error| {
        CommandError::new(
            "clipboard_unavailable",
            format!("Could not access clipboard: {error}"),
        )
    })?;

    match clipboard.get_text() {
        Ok(text) => {
            if text.is_empty() {
                Ok(ReadClipboardResult {
                    text: String::new(),
                    empty: true,
                })
            } else {
                Ok(ReadClipboardResult {
                    text: truncate_clipboard(text),
                    empty: false,
                })
            }
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(ReadClipboardResult {
            text: String::new(),
            empty: true,
        }),
        Err(error) => Err(CommandError::new(
            "clipboard_read_failed",
            format!("Failed to read clipboard: {error}"),
        )),
    }
}

#[tauri::command]
pub fn write_clipboard(text: String) -> Result<WriteClipboardResult, CommandError> {
    let mut clipboard = Clipboard::new().map_err(|error| {
        CommandError::new(
            "clipboard_unavailable",
            format!("Could not access clipboard: {error}"),
        )
    })?;

    let bytes = text.len();
    clipboard.set_text(text).map_err(|error| {
        CommandError::new(
            "clipboard_write_failed",
            format!("Failed to write clipboard: {error}"),
        )
    })?;

    Ok(WriteClipboardResult { bytes })
}
