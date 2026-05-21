//! Draw the OS mouse cursor onto an RGBA screen bitmap so vision sees pointer placement.

#[cfg(not(target_os = "windows"))]
pub fn composite_cursor_into_rgba(
    _img: &mut screenshots::image::RgbaImage,
    _display_info: &screenshots::display_info::DisplayInfo,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn composite_cursor_into_rgba(
    img: &mut screenshots::image::RgbaImage,
    display_info: &screenshots::display_info::DisplayInfo,
) -> Result<(), String> {
    use std::mem::{size_of, zeroed};
    use std::slice;

    use screenshots::display_info::DisplayInfo;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, RGBQUAD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DrawIconEx, GetCursorInfo, GetIconInfo, CURSORINFO, CURSOR_SHOWING, DI_NORMAL, HICON,
        ICONINFO,
    };

    fn monitor_contains_logical_pt(
        di: &DisplayInfo,
        pt: windows::Win32::Foundation::POINT,
    ) -> bool {
        let mx = di.x;
        let my = di.y;
        let mw = di.width as i32;
        let mh = di.height as i32;
        pt.x >= mx && pt.x < mx + mw && pt.y >= my && pt.y < my + mh
    }

    fn logical_monitor_rel_to_capture_px(
        di: &DisplayInfo,
        pt: windows::Win32::Foundation::POINT,
    ) -> (i32, i32) {
        let fx = di.scale_factor as f64;
        let ix = ((pt.x - di.x) as f64 * fx).round() as i32;
        let iy = ((pt.y - di.y) as f64 * fx).round() as i32;
        (ix, iy)
    }

    fn rgba_to_bgra_inplace(src: &[u8], dst: &mut [u8]) {
        debug_assert_eq!(src.len(), dst.len());
        for (s, d) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
            d[0] = s[2];
            d[1] = s[1];
            d[2] = s[0];
            d[3] = s[3];
        }
    }

    fn bgra_to_rgba_inplace(src: &[u8], dst: &mut [u8]) {
        rgba_to_bgra_inplace(src, dst);
    }

    unsafe fn cleanup_icon_bitmaps(ii: &ICONINFO) {
        let _ = DeleteObject(ii.hbmMask.into());
        if !ii.hbmColor.is_invalid() {
            let _ = DeleteObject(ii.hbmColor.into());
        }
    }

    let w = img.width() as i32;
    let h = img.height() as i32;
    if w <= 0 || h <= 0 {
        return Ok(());
    }

    let mut ci: CURSORINFO = unsafe { zeroed() };
    ci.cbSize = size_of::<CURSORINFO>() as u32;
    unsafe { GetCursorInfo(&mut ci).map_err(|e| e.to_string())? };

    if (ci.flags.0 & CURSOR_SHOWING.0) == 0 {
        return Ok(());
    }

    if !monitor_contains_logical_pt(display_info, ci.ptScreenPos) {
        return Ok(());
    }

    let (tip_x, tip_y) = logical_monitor_rel_to_capture_px(display_info, ci.ptScreenPos);

    let mut ii: ICONINFO = unsafe { zeroed() };
    unsafe {
        GetIconInfo(HICON(ci.hCursor.0), &mut ii).map_err(|e| e.to_string())?;
    }

    let hx = ii.xHotspot as i32;
    let hy = ii.yHotspot as i32;
    let draw_x = tip_x - hx;
    let draw_y = tip_y - hy;

    unsafe {
        let hdc_screen = GetDC(None);
        if hdc_screen.is_invalid() {
            cleanup_icon_bitmaps(&ii);
            return Err("GetDC returned invalid handle".to_string());
        }

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let hbitmap =
            match CreateDIBSection(Some(hdc_screen), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
                Ok(hb) => hb,
                Err(e) => {
                    let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
                    cleanup_icon_bitmaps(&ii);
                    return Err(e.to_string());
                }
            };

        let src_rgba = img.as_raw();
        let len = (w * h * 4) as usize;
        if bits.is_null() {
            let _ = DeleteObject(hbitmap.into());
            let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
            cleanup_icon_bitmaps(&ii);
            return Err("CreateDIBSection returned null bits pointer".to_string());
        }
        let dib_sl = slice::from_raw_parts_mut(bits as *mut u8, len);
        rgba_to_bgra_inplace(src_rgba, dib_sl);

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.is_invalid() {
            let _ = DeleteObject(hbitmap.into());
            let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
            cleanup_icon_bitmaps(&ii);
            return Err("CreateCompatibleDC failed".to_string());
        }

        let old: HGDIOBJ = SelectObject(hdc_mem, hbitmap.into());

        let draw_result = DrawIconEx(
            hdc_mem,
            draw_x,
            draw_y,
            HICON(ci.hCursor.0),
            0,
            0,
            0,
            None,
            DI_NORMAL,
        );

        let _ = SelectObject(hdc_mem, old);
        let _ = DeleteDC(hdc_mem);

        if draw_result.is_err() {
            let _ = DeleteObject(hbitmap.into());
            let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
            cleanup_icon_bitmaps(&ii);
            return draw_result.map_err(|e| e.to_string());
        }

        let flat = img.as_flat_samples_mut();
        debug_assert_eq!(flat.samples.len(), len);
        bgra_to_rgba_inplace(dib_sl, flat.samples);

        let _ = DeleteObject(hbitmap.into());
        let _ = ReleaseDC(Some(HWND::default()), hdc_screen);
        cleanup_icon_bitmaps(&ii);
    }

    Ok(())
}
