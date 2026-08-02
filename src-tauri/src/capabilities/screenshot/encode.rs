//! Shared RGBA → PNG encode + downscale for screenshot captures.

use std::io::Cursor;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::imageops::FilterType;
use image::{ImageBuffer, ImageFormat, RgbaImage};

use crate::capabilities::error::{CommandError, ErrorCode};

pub(super) const MAX_LONG_EDGE: u32 = 1280;
const MAX_IMAGE_DECODED_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug)]
pub(super) struct CapturedRgba {
    pub width: u32,
    pub height: u32,
    /// Tightly packed RGBA8 rows.
    pub pixels: Vec<u8>,
}

pub(super) fn is_blank_capture(image: &CapturedRgba) -> bool {
    let (w, h) = (image.width, image.height);
    if w == 0 || h == 0 || image.pixels.len() < (w as usize) * (h as usize) * 4 {
        return true;
    }
    let step_x = (w / 32).max(1);
    let step_y = (h / 32).max(1);
    let mut total = 0u32;
    let mut zero = 0u32;
    let mut y = 0u32;
    while y < h {
        let mut x = 0u32;
        while x < w {
            total += 1;
            let i = ((y as usize) * (w as usize) + (x as usize)) * 4;
            if image.pixels[i] == 0 && image.pixels[i + 1] == 0 && image.pixels[i + 2] == 0 {
                zero += 1;
            }
            x = x.saturating_add(step_x);
        }
        y = y.saturating_add(step_y);
    }
    total > 0 && zero * 100 / total >= 99
}

pub(super) fn maybe_downscale(image: CapturedRgba) -> Result<CapturedRgba, CommandError> {
    let long = image.width.max(image.height);
    if long <= MAX_LONG_EDGE {
        return Ok(image);
    }
    let scale = MAX_LONG_EDGE as f32 / long as f32;
    let new_w = ((image.width as f32) * scale).round().max(1.0) as u32;
    let new_h = ((image.height as f32) * scale).round().max(1.0) as u32;
    let rgba: RgbaImage = ImageBuffer::from_raw(image.width, image.height, image.pixels)
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::CaptureFailed,
                "Image byte length does not match RGBA dimensions",
            )
        })?;
    let resized = image::imageops::resize(&rgba, new_w, new_h, FilterType::Triangle);
    let (width, height) = resized.dimensions();
    Ok(CapturedRgba {
        width,
        height,
        pixels: resized.into_raw(),
    })
}

pub(super) fn encode_png_base64(image: CapturedRgba) -> Result<(u32, u32, String), CommandError> {
    let width = image.width;
    let height = image.height;
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or_else(|| CommandError::new(ErrorCode::CaptureFailed, "Image dimensions overflow"))?;
    if image.pixels.len() != expected {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            "Image byte length does not match RGBA dimensions",
        ));
    }
    if image.pixels.len() > MAX_IMAGE_DECODED_BYTES {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            format!("Image exceeds {MAX_IMAGE_DECODED_BYTES} decoded bytes"),
        ));
    }

    let rgba: RgbaImage = ImageBuffer::from_raw(width, height, image.pixels).ok_or_else(|| {
        CommandError::new(
            ErrorCode::CaptureFailed,
            "Failed to build RGBA image buffer",
        )
    })?;

    let mut png_bytes = Vec::new();
    rgba.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|error| {
            CommandError::new(
                ErrorCode::CaptureFailed,
                format!("Failed to encode PNG: {error}"),
            )
        })?;

    Ok((width, height, BASE64.encode(png_bytes)))
}
