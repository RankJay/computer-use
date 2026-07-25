//! macOS CoreGraphics window / display capture.

use std::ptr;

use objc2_core_foundation::{CFDictionary, CFRetained, CFString, CFType, CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    kCGWindowBounds, kCGWindowIsOnscreen, kCGWindowNumber, CGBitmapContextCreate,
    CGBitmapContextGetData, CGBitmapInfo, CGColorSpaceCreateDeviceRGB, CGContextDrawImage,
    CGDisplayBounds, CGDisplayCreateImage, CGImage, CGImageAlphaInfo, CGImageGetHeight,
    CGImageGetWidth, CGMainDisplayID, CGPreflightScreenCaptureAccess,
    CGRectMakeWithDictionaryRepresentation, CGRectNull, CGWindowImageOption,
    CGWindowListCopyWindowInfo, CGWindowListCreateImage, CGWindowListOption,
};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::shared::macos_ax::{dict_bool, dict_number};
use crate::capabilities::window::WindowId;

use super::encode::CapturedRgba;
use super::{RawCapture, ScreenshotBounds};

const SCREEN_RECORDING_HINT: &str =
    "Grant Screen Recording for Actuate in System Settings → Privacy & Security → Screen Recording";

fn require_screen_recording() -> Result<(), CommandError> {
    if CGPreflightScreenCaptureAccess() {
        return Ok(());
    }
    Err(CommandError::new(
        ErrorCode::OsPermissionDenied,
        format!("Screen Recording permission required. {SCREEN_RECORDING_HINT}"),
    ))
}

fn cgimage_to_rgba(image: &CGImage) -> Result<CapturedRgba, CommandError> {
    let width = CGImageGetWidth(Some(image));
    let height = CGImageGetHeight(Some(image));
    if width == 0 || height == 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Capture produced an empty image",
        ));
    }

    let color_space = CGColorSpaceCreateDeviceRGB().ok_or_else(|| {
        CommandError::new(ErrorCode::CaptureFailed, "Could not create RGB color space")
    })?;

    let bytes_per_row = width
        .checked_mul(4)
        .ok_or_else(|| CommandError::new(ErrorCode::CaptureFailed, "Image row stride overflow"))?;
    let bitmap_info = CGImageAlphaInfo::PremultipliedLast.0 | CGBitmapInfo::ByteOrder32Big.0;

    let context = unsafe {
        CGBitmapContextCreate(
            ptr::null_mut(),
            width,
            height,
            8,
            bytes_per_row,
            Some(&color_space),
            bitmap_info,
        )
    }
    .ok_or_else(|| {
        CommandError::new(ErrorCode::CaptureFailed, "Could not create bitmap context")
    })?;

    let rect = CGRect::new(CGPoint::ZERO, CGSize::new(width as f64, height as f64));
    unsafe {
        CGContextDrawImage(Some(&context), rect, Some(image));
    }

    let data_ptr = unsafe { CGBitmapContextGetData(Some(&context)) };
    if data_ptr.is_null() {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            "Bitmap context has no data",
        ));
    }

    let byte_len = bytes_per_row
        .checked_mul(height)
        .ok_or_else(|| CommandError::new(ErrorCode::CaptureFailed, "Image buffer overflow"))?;
    let slice = unsafe { std::slice::from_raw_parts(data_ptr as *const u8, byte_len) };

    Ok(CapturedRgba {
        width: width as u32,
        height: height as u32,
        pixels: slice.to_vec(),
    })
}

fn bounds_from_cg_rect(rect: CGRect) -> ScreenshotBounds {
    ScreenshotBounds {
        x: rect.origin.x.round() as i32,
        y: rect.origin.y.round() as i32,
        width: rect.size.width.round() as i32,
        height: rect.size.height.round() as i32,
    }
}

pub(super) fn capture_primary_display() -> Result<RawCapture, CommandError> {
    require_screen_recording()?;
    let display_id = CGMainDisplayID();
    let bounds = CGDisplayBounds(display_id);
    let image = CGDisplayCreateImage(display_id).ok_or_else(|| {
        CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Could not capture primary display",
        )
    })?;
    let rgba = cgimage_to_rgba(&image)?;
    Ok(RawCapture {
        image: rgba,
        bounds: bounds_from_cg_rect(bounds),
    })
}

fn lookup_window_bounds(id: WindowId) -> Result<ScreenshotBounds, CommandError> {
    if id.0 <= 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle must be positive",
        ));
    }
    let target = id.0 as u32;
    let Some(raw_list) =
        CGWindowListCopyWindowInfo(CGWindowListOption::OptionIncludingWindow, target)
    else {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle is not valid",
        ));
    };
    let list: CFRetained<objc2_core_foundation::CFArray<CFDictionary<CFString, CFType>>> =
        unsafe { CFRetained::cast_unchecked(raw_list) };

    for dict in list.iter() {
        let Some(window_id) = dict_number(&dict, unsafe { kCGWindowNumber }) else {
            continue;
        };
        if window_id as u32 != target {
            continue;
        }
        if dict_bool(&dict, unsafe { kCGWindowIsOnscreen }) == Some(false) {
            return Err(CommandError::new(
                ErrorCode::CaptureUnavailable,
                "Window is not on screen",
            ));
        }
        let Some(bounds_val) = dict.get(unsafe { kCGWindowBounds }) else {
            return Err(CommandError::new(
                ErrorCode::CaptureUnavailable,
                "Window bounds unavailable",
            ));
        };
        let bounds_dict = bounds_val.downcast::<CFDictionary>().map_err(|_| {
            CommandError::new(ErrorCode::CaptureFailed, "Window bounds dictionary invalid")
        })?;
        let mut rect = CGRect::ZERO;
        let ok = unsafe {
            CGRectMakeWithDictionaryRepresentation(Some(bounds_dict.as_ref()), &mut rect)
        };
        if !ok {
            return Err(CommandError::new(
                ErrorCode::CaptureFailed,
                "Could not parse window bounds",
            ));
        }
        return Ok(bounds_from_cg_rect(rect));
    }

    Err(CommandError::new(
        ErrorCode::InvalidHwnd,
        "Window handle is not valid",
    ))
}

pub(super) fn capture_window(id: WindowId) -> Result<RawCapture, CommandError> {
    require_screen_recording()?;
    let bounds = lookup_window_bounds(id)?;
    let image_option =
        CGWindowImageOption::BoundsIgnoreFraming | CGWindowImageOption::BestResolution;
    let image = CGWindowListCreateImage(
        // CGRectNull ⇒ use the window's own bounds.
        CGRectNull,
        CGWindowListOption::OptionIncludingWindow,
        id.0 as u32,
        image_option,
    )
    .ok_or_else(|| {
        CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Could not capture window pixels",
        )
    })?;

    let rgba = cgimage_to_rgba(&image)?;
    Ok(RawCapture {
        image: rgba,
        bounds,
    })
}
