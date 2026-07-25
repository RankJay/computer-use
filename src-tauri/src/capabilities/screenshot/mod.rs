//! Screen / window pixel capture for the `screenshot` capability.

mod encode;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod win32;

use serde::{Deserialize, Serialize};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use encode::{encode_png_base64, is_blank_capture, maybe_downscale, CapturedRgba};

#[cfg(not(any(windows, target_os = "macos")))]
use crate::capabilities::error::unsupported_platform;
#[cfg(test)]
use encode::MAX_LONG_EDGE;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScreenshotTarget {
    Display,
    Window,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotResult {
    pub width: u32,
    pub height: u32,
    pub mime_type: String,
    pub base64: String,
    pub bounds: ScreenshotBounds,
    /// Screen units per image pixel (x-axis).
    pub scale: f64,
}

struct RawCapture {
    image: CapturedRgba,
    bounds: ScreenshotBounds,
}

fn finish_capture(raw: RawCapture) -> Result<ScreenshotResult, CommandError> {
    if raw.image.width == 0 || raw.image.height == 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Capture produced an empty image",
        ));
    }
    if is_blank_capture(&raw.image) {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Capture is blank (window may be minimized, occluded, or protected)",
        ));
    }
    if raw.bounds.width <= 0 || raw.bounds.height <= 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Capture bounds are invalid",
        ));
    }

    let scaled = maybe_downscale(raw.image)?;
    let (width, height, base64) = encode_png_base64(scaled)?;
    let scale = f64::from(raw.bounds.width) / f64::from(width);

    Ok(ScreenshotResult {
        width,
        height,
        mime_type: "image/png".to_string(),
        base64,
        bounds: raw.bounds,
        scale,
    })
}

#[tauri::command]
pub fn screenshot(
    target: ScreenshotTarget,
    window_id: Option<WindowId>,
) -> Result<ScreenshotResult, CommandError> {
    match target {
        ScreenshotTarget::Display => {
            #[cfg(windows)]
            {
                return finish_capture(win32::capture_primary_display()?);
            }
            #[cfg(target_os = "macos")]
            {
                return finish_capture(macos::capture_primary_display()?);
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                return Err(unsupported_platform("screenshot"));
            }
        }
        ScreenshotTarget::Window => {
            let Some(window_id) = window_id else {
                return Err(CommandError::new(
                    ErrorCode::InvalidInput,
                    "windowId is required when target is window",
                ));
            };
            #[cfg(windows)]
            {
                return finish_capture(win32::capture_window(window_id)?);
            }
            #[cfg(target_os = "macos")]
            {
                return finish_capture(macos::capture_window(window_id)?);
            }
            #[cfg(not(any(windows, target_os = "macos")))]
            {
                let _ = window_id;
                return Err(unsupported_platform("screenshot"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use encode::CapturedRgba;

    #[test]
    fn blank_capture_rejected() {
        let image = CapturedRgba {
            width: 4,
            height: 4,
            pixels: vec![0; 4 * 4 * 4],
        };
        let err = finish_capture(RawCapture {
            image,
            bounds: ScreenshotBounds {
                x: 0,
                y: 0,
                width: 4,
                height: 4,
            },
        })
        .expect_err("blank");
        assert_eq!(err.code, "capture_unavailable");
    }

    #[test]
    fn downscale_sets_scale_from_bounds() {
        let mut pixels = vec![0u8; 2000 * 1000 * 4];
        // Non-zero so blank check passes.
        for chunk in pixels.chunks_mut(4) {
            chunk[0] = 40;
            chunk[1] = 40;
            chunk[2] = 40;
            chunk[3] = 255;
        }
        let result = finish_capture(RawCapture {
            image: CapturedRgba {
                width: 2000,
                height: 1000,
                pixels,
            },
            bounds: ScreenshotBounds {
                x: 10,
                y: 20,
                width: 2000,
                height: 1000,
            },
        })
        .expect("encode");
        assert!(result.width <= MAX_LONG_EDGE);
        assert!(result.height <= MAX_LONG_EDGE);
        assert!((result.scale - f64::from(2000) / f64::from(result.width)).abs() < 0.01);
        assert_eq!(result.bounds.x, 10);
        assert_eq!(result.mime_type, "image/png");
        assert!(!result.base64.is_empty());
    }

    #[test]
    fn downscale_rejects_mismatched_pixel_buffer() {
        let err = encode::maybe_downscale(CapturedRgba {
            width: 2000,
            height: 1000,
            // Too short for declared dimensions — must not silently become empty.
            pixels: vec![1u8; 16],
        })
        .expect_err("mismatch");
        assert_eq!(err.code, "capture_failed");
    }
}
