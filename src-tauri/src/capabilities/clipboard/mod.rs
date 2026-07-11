use std::borrow::Cow;
use std::io::Cursor;

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{ImageBuffer, ImageFormat, RgbaImage};
use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};

const MAX_CLIPBOARD_BYTES: usize = 512_000;
const MAX_IMAGE_DECODED_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadClipboardResult {
    pub text: String,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteClipboardResult {
    pub bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadClipboardHtmlResult {
    pub html: String,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteClipboardHtmlResult {
    pub bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadClipboardImageResult {
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
    pub base64: String,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteClipboardImageResult {
    pub width: u32,
    pub height: u32,
    pub bytes: usize,
}

fn open_clipboard() -> Result<Clipboard, CommandError> {
    Clipboard::new().map_err(|error| {
        CommandError::new(
            ErrorCode::ClipboardUnavailable,
            format!("Could not access clipboard: {error}"),
        )
    })
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

fn empty_image_result() -> ReadClipboardImageResult {
    ReadClipboardImageResult {
        width: 0,
        height: 0,
        mime_type: "image/png".to_string(),
        base64: String::new(),
        empty: true,
    }
}

fn rgba_to_png_base64(
    width: usize,
    height: usize,
    bytes: &[u8],
) -> Result<(u32, u32, String), CommandError> {
    let width_u32 = u32::try_from(width).map_err(|_| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            "Image width is out of range",
        )
    })?;
    let height_u32 = u32::try_from(height).map_err(|_| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            "Image height is out of range",
        )
    })?;

    let expected = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ClipboardImageInvalid,
                "Image dimensions overflow",
            )
        })?;
    if bytes.len() != expected {
        return Err(CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            format!(
                "Image byte length {} does not match {}x{} RGBA",
                bytes.len(),
                width,
                height
            ),
        ));
    }
    if bytes.len() > MAX_IMAGE_DECODED_BYTES {
        return Err(CommandError::new(
            ErrorCode::ClipboardImageTooLarge,
            format!("Image exceeds {MAX_IMAGE_DECODED_BYTES} decoded bytes"),
        ));
    }

    let image: RgbaImage = ImageBuffer::from_raw(width_u32, height_u32, bytes.to_vec())
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::ClipboardImageInvalid,
                "Failed to build RGBA image buffer",
            )
        })?;

    let mut png_bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|error| {
            CommandError::new(
                ErrorCode::ClipboardImageEncodeFailed,
                format!("Failed to encode PNG: {error}"),
            )
        })?;

    Ok((width_u32, height_u32, BASE64.encode(png_bytes)))
}

fn png_base64_to_image_data(base64: &str) -> Result<ImageData<'static>, CommandError> {
    let png_bytes = BASE64.decode(base64.trim()).map_err(|error| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            format!("Invalid base64 image payload: {error}"),
        )
    })?;

    if png_bytes.len() > MAX_IMAGE_DECODED_BYTES {
        return Err(CommandError::new(
            ErrorCode::ClipboardImageTooLarge,
            format!("Image exceeds {MAX_IMAGE_DECODED_BYTES} bytes"),
        ));
    }

    let dyn_image = image::load_from_memory(&png_bytes).map_err(|error| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            format!("Failed to decode PNG: {error}"),
        )
    })?;
    let rgba = dyn_image.to_rgba8();
    let width = rgba.width() as usize;
    let height = rgba.height() as usize;
    let bytes = rgba.into_raw();

    if bytes.len() > MAX_IMAGE_DECODED_BYTES {
        return Err(CommandError::new(
            ErrorCode::ClipboardImageTooLarge,
            format!("Decoded image exceeds {MAX_IMAGE_DECODED_BYTES} bytes"),
        ));
    }

    Ok(ImageData {
        width,
        height,
        bytes: Cow::Owned(bytes),
    })
}

#[tauri::command]
pub fn read_clipboard() -> Result<ReadClipboardResult, CommandError> {
    let mut clipboard = open_clipboard()?;

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
            ErrorCode::ClipboardReadFailed,
            format!("Failed to read clipboard: {error}"),
        )),
    }
}

#[tauri::command]
pub fn write_clipboard(text: String) -> Result<WriteClipboardResult, CommandError> {
    let mut clipboard = open_clipboard()?;

    let bytes = text.len();
    clipboard.set_text(text).map_err(|error| {
        CommandError::new(
            ErrorCode::ClipboardWriteFailed,
            format!("Failed to write clipboard: {error}"),
        )
    })?;

    Ok(WriteClipboardResult { bytes })
}

#[tauri::command]
pub fn read_clipboard_html() -> Result<ReadClipboardHtmlResult, CommandError> {
    let mut clipboard = open_clipboard()?;

    match clipboard.get().html() {
        Ok(html) => {
            if html.is_empty() {
                Ok(ReadClipboardHtmlResult {
                    html: String::new(),
                    empty: true,
                })
            } else {
                Ok(ReadClipboardHtmlResult {
                    html: truncate_clipboard(html),
                    empty: false,
                })
            }
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(ReadClipboardHtmlResult {
            html: String::new(),
            empty: true,
        }),
        Err(error) => Err(CommandError::new(
            ErrorCode::ClipboardReadFailed,
            format!("Failed to read HTML from clipboard: {error}"),
        )),
    }
}

#[tauri::command]
pub fn write_clipboard_html(html: String) -> Result<WriteClipboardHtmlResult, CommandError> {
    let mut clipboard = open_clipboard()?;
    let bytes = html.len();
    clipboard
        .set_html(html.clone(), Some(html))
        .map_err(|error| {
            CommandError::new(
                ErrorCode::ClipboardWriteFailed,
                format!("Failed to write HTML to clipboard: {error}"),
            )
        })?;

    Ok(WriteClipboardHtmlResult { bytes })
}

#[tauri::command]
pub fn read_clipboard_image() -> Result<ReadClipboardImageResult, CommandError> {
    let mut clipboard = open_clipboard()?;

    match clipboard.get_image() {
        Ok(image) => {
            if image.width == 0 || image.height == 0 || image.bytes.is_empty() {
                return Ok(empty_image_result());
            }
            let (width, height, base64) =
                rgba_to_png_base64(image.width, image.height, &image.bytes)?;
            Ok(ReadClipboardImageResult {
                width,
                height,
                mime_type: "image/png".to_string(),
                base64,
                empty: false,
            })
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(empty_image_result()),
        Err(error) => Err(CommandError::new(
            ErrorCode::ClipboardReadFailed,
            format!("Failed to read image from clipboard: {error}"),
        )),
    }
}

#[tauri::command]
pub fn write_clipboard_image(
    base64: String,
    mime_type: Option<String>,
) -> Result<WriteClipboardImageResult, CommandError> {
    if let Some(mime) = mime_type.as_deref() {
        if mime != "image/png" {
            return Err(CommandError::new(
                ErrorCode::ClipboardImageInvalid,
                format!("Unsupported mime type '{mime}'; only image/png is supported"),
            ));
        }
    }

    let image = png_base64_to_image_data(&base64)?;
    let width = u32::try_from(image.width).map_err(|_| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            "Image width is out of range",
        )
    })?;
    let height = u32::try_from(image.height).map_err(|_| {
        CommandError::new(
            ErrorCode::ClipboardImageInvalid,
            "Image height is out of range",
        )
    })?;
    let bytes = image.bytes.len();

    let mut clipboard = open_clipboard()?;
    clipboard.set_image(image).map_err(|error| {
        CommandError::new(
            ErrorCode::ClipboardWriteFailed,
            format!("Failed to write image to clipboard: {error}"),
        )
    })?;

    Ok(WriteClipboardImageResult {
        width,
        height,
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_png_base64_through_rgba() {
        let mut png_bytes = Vec::new();
        let image = ImageBuffer::from_pixel(2, 2, image::Rgba([1u8, 2, 3, 255]));
        image
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .expect("encode");
        let encoded = BASE64.encode(&png_bytes);

        let data = png_base64_to_image_data(&encoded).expect("decode");
        assert_eq!(data.width, 2);
        assert_eq!(data.height, 2);
        assert_eq!(data.bytes.len(), 16);

        let (width, height, again) =
            rgba_to_png_base64(data.width, data.height, &data.bytes).expect("re-encode");
        assert_eq!(width, 2);
        assert_eq!(height, 2);
        assert!(!again.is_empty());
    }

    #[test]
    fn rejects_invalid_base64() {
        let error = png_base64_to_image_data("%%%").expect_err("invalid");
        assert_eq!(error.code, "clipboard_image_invalid");
    }
}
