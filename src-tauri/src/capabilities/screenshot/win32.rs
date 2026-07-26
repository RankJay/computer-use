//! Windows GDI / PrintWindow capture.

use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
    GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HBITMAP, HDC, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetSystemMetrics, GetWindowRect, IsIconic, IsWindow, IsWindowVisible,
    SM_CXSCREEN, SM_CYSCREEN,
};

/// Not always re-exported as a named const in windows 0.62; value matches WinUser.h.
const PW_RENDERFULLCONTENT: PRINT_WINDOW_FLAGS = PRINT_WINDOW_FLAGS(2);

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::encode::CapturedRgba;
use super::{RawCapture, ScreenshotBounds};

struct GdiBitmap {
    screen_dc: HDC,
    mem_dc: HDC,
    bitmap: HBITMAP,
    old_bitmap: windows::Win32::Graphics::Gdi::HGDIOBJ,
    width: i32,
    height: i32,
}

impl Drop for GdiBitmap {
    fn drop(&mut self) {
        unsafe {
            let _ = SelectObject(self.mem_dc, self.old_bitmap);
            let _ = DeleteObject(self.bitmap.into());
            let _ = DeleteDC(self.mem_dc);
            let _ = ReleaseDC(None, self.screen_dc);
        }
    }
}

fn create_compatible(width: i32, height: i32) -> Result<GdiBitmap, CommandError> {
    if width <= 0 || height <= 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Capture size is invalid",
        ));
    }
    unsafe {
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err(CommandError::new(
                ErrorCode::CaptureFailed,
                "Could not get screen DC",
            ));
        }
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(None, screen_dc);
            return Err(CommandError::new(
                ErrorCode::CaptureFailed,
                "Could not create memory DC",
            ));
        }
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(None, screen_dc);
            return Err(CommandError::new(
                ErrorCode::CaptureFailed,
                "Could not create compatible bitmap",
            ));
        }
        let old_bitmap = SelectObject(mem_dc, bitmap.into());
        Ok(GdiBitmap {
            screen_dc,
            mem_dc,
            bitmap,
            old_bitmap,
            width,
            height,
        })
    }
}

fn dib_to_rgba(gdi: &GdiBitmap) -> Result<CapturedRgba, CommandError> {
    let width = gdi.width as u32;
    let height = gdi.height as u32;
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: gdi.width,
            biHeight: -gdi.height, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0 as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bgra = vec![0u8; (width as usize) * (height as usize) * 4];
    let lines = unsafe {
        GetDIBits(
            gdi.mem_dc,
            gdi.bitmap,
            0,
            height,
            Some(bgra.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        )
    };
    if lines == 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            "GetDIBits failed",
        ));
    }

    let mut rgba = vec![0u8; bgra.len()];
    for (src, dst) in bgra.chunks_exact(4).zip(rgba.chunks_exact_mut(4)) {
        dst[0] = src[2];
        dst[1] = src[1];
        dst[2] = src[0];
        dst[3] = 255;
    }

    Ok(CapturedRgba {
        width,
        height,
        pixels: rgba,
    })
}

pub(super) fn capture_primary_display() -> Result<RawCapture, CommandError> {
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    capture_screen_region(0, 0, width, height)
}

/// Capture a screen-space rectangle (same coords as `SetCursorPos` / screenshot bounds).
pub(super) fn capture_screen_region(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<RawCapture, CommandError> {
    if width <= 0 || height <= 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidCoordinates,
            format!("Region size must be positive (got {width}x{height})"),
        ));
    }
    let gdi = create_compatible(width, height)?;
    let ok = unsafe {
        BitBlt(
            gdi.mem_dc,
            0,
            0,
            width,
            height,
            Some(gdi.screen_dc),
            x,
            y,
            SRCCOPY,
        )
    };
    if ok.is_err() {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            format!("BitBlt of screen region ({x},{y},{width}x{height}) failed"),
        ));
    }
    let image = dib_to_rgba(&gdi)?;
    Ok(RawCapture {
        image,
        bounds: ScreenshotBounds {
            x,
            y,
            width,
            height,
        },
    })
}

fn hwnd_from_id(id: WindowId) -> Result<HWND, CommandError> {
    if id.0 == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle must be non-zero",
        ));
    }
    let hwnd = HWND(id.0 as *mut core::ffi::c_void);
    if !unsafe { IsWindow(Some(hwnd)).as_bool() } {
        return Err(CommandError::new(
            ErrorCode::InvalidHwnd,
            "Window handle is not valid",
        ));
    }
    Ok(hwnd)
}

pub(super) fn capture_window(id: WindowId) -> Result<RawCapture, CommandError> {
    let hwnd = hwnd_from_id(id)?;
    if unsafe { IsIconic(hwnd).as_bool() } {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Window is minimized",
        ));
    }
    if !unsafe { IsWindowVisible(hwnd).as_bool() } {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Window is not visible",
        ));
    }

    let (width, height, bounds) = window_capture_geometry(hwnd)?;

    let gdi = create_compatible(width, height)?;
    let printed = unsafe { PrintWindow(hwnd, gdi.mem_dc, PW_RENDERFULLCONTENT) };
    if !printed.as_bool() {
        // Fallback: BitBlt from screen at capture origin (needs on-screen pixels).
        let ok = unsafe {
            BitBlt(
                gdi.mem_dc,
                0,
                0,
                width,
                height,
                Some(gdi.screen_dc),
                bounds.x,
                bounds.y,
                SRCCOPY,
            )
        };
        if ok.is_err() {
            return Err(CommandError::new(
                ErrorCode::CaptureUnavailable,
                "Could not capture window pixels",
            ));
        }
    }

    let image = dib_to_rgba(&gdi)?;
    Ok(RawCapture { image, bounds })
}

/// Outer window rect when valid; otherwise client rect mapped to screen.
fn window_capture_geometry(hwnd: HWND) -> Result<(i32, i32, ScreenshotBounds), CommandError> {
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            "GetWindowRect failed",
        ));
    }
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    if width > 0 && height > 0 {
        return Ok((
            width,
            height,
            ScreenshotBounds {
                x: rect.left,
                y: rect.top,
                width,
                height,
            },
        ));
    }

    let mut client = RECT::default();
    if unsafe { GetClientRect(hwnd, &mut client) }.is_err() {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Window has empty bounds",
        ));
    }
    let width = client.right - client.left;
    let height = client.bottom - client.top;
    if width <= 0 || height <= 0 {
        return Err(CommandError::new(
            ErrorCode::CaptureUnavailable,
            "Window has empty bounds",
        ));
    }

    let mut origin = POINT { x: 0, y: 0 };
    if !unsafe { ClientToScreen(hwnd, &mut origin) }.as_bool() {
        return Err(CommandError::new(
            ErrorCode::CaptureFailed,
            "ClientToScreen failed",
        ));
    }

    Ok((
        width,
        height,
        ScreenshotBounds {
            x: origin.x,
            y: origin.y,
            width,
            height,
        },
    ))
}
