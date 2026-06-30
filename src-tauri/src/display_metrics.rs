//! Resolves the true capture-to-cursor scale factor. The screenshots crate sometimes
//! reports scale_factor=1 on Windows even when display scaling is 150%.

use screenshots::display_info::DisplayInfo;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Copy)]
pub struct CaptureMetrics {
    pub image_width: u32,
    pub image_height: u32,
    pub effective_scale: f64,
}

static LAST_CAPTURE_METRICS: OnceLock<Mutex<Option<CaptureMetrics>>> = OnceLock::new();

fn last_capture_metrics_lock() -> &'static Mutex<Option<CaptureMetrics>> {
    LAST_CAPTURE_METRICS.get_or_init(|| Mutex::new(None))
}

pub fn remember_capture_metrics(metrics: CaptureMetrics) {
    if let Ok(mut slot) = last_capture_metrics_lock().lock() {
        *slot = Some(metrics);
    }
}

pub fn metrics_for_pointer_move(display_info: &DisplayInfo) -> CaptureMetrics {
    if let Ok(slot) = last_capture_metrics_lock().lock() {
        if let Some(metrics) = *slot {
            return metrics;
        }
    }
    let (image_width, image_height) = capture_image_dimensions(display_info);
    CaptureMetrics {
        image_width,
        image_height,
        effective_scale: effective_scale(display_info),
    }
}

pub fn capture_image_dimensions(display_info: &DisplayInfo) -> (u32, u32) {
    let scale = effective_scale(display_info);
    let width = (display_info.width as f64 * scale).round().max(1.0) as u32;
    let height = (display_info.height as f64 * scale).round().max(1.0) as u32;
    (width, height)
}

pub fn metrics_from_capture(
    display_info: &DisplayInfo,
    image_width: u32,
    image_height: u32,
) -> CaptureMetrics {
    let derived_x = image_width as f64 / display_info.width.max(1) as f64;
    let derived_y = image_height as f64 / display_info.height.max(1) as f64;
    let derived = derived_x.max(derived_y);
    let reported = display_info.scale_factor as f64;

    // Prefer scale derived from actual capture pixels when the API under-reports DPI.
    let effective_scale = if reported <= 1.01 && derived > 1.05 {
        derived
    } else if (derived - reported).abs() > 0.15 {
        derived
    } else {
        reported.max(1.0)
    };

    CaptureMetrics {
        image_width,
        image_height,
        effective_scale,
    }
}

pub fn effective_scale(display_info: &DisplayInfo) -> f64 {
    (display_info.scale_factor as f64).max(1.0)
}

pub fn capture_pixel_to_pointer(
    image_x: i32,
    image_y: i32,
    display_info: &DisplayInfo,
    metrics: &CaptureMetrics,
) -> (i32, i32) {
    let scale = metrics.effective_scale;
    (
        display_info
            .x
            .saturating_add((image_x as f64 / scale).round() as i32),
        display_info
            .y
            .saturating_add((image_y as f64 / scale).round() as i32),
    )
}

pub fn pointer_to_capture_pixel(
    cursor_x: i32,
    cursor_y: i32,
    display_info: &DisplayInfo,
    metrics: &CaptureMetrics,
) -> Option<(i32, i32)> {
    let scale = metrics.effective_scale;
    let image_x = ((cursor_x - display_info.x) as f64 * scale).round() as i32;
    let image_y = ((cursor_y - display_info.y) as f64 * scale).round() as i32;
    if image_x < 0
        || image_y < 0
        || image_x >= metrics.image_width as i32
        || image_y >= metrics.image_height as i32
    {
        return None;
    }
    Some((image_x, image_y))
}

pub fn pointer_bounds(display_info: &DisplayInfo, metrics: &CaptureMetrics) -> (i32, i32, i32, i32) {
    let logical_width = (metrics.image_width as f64 / metrics.effective_scale)
        .round()
        .max(1.0) as i32;
    let logical_height = (metrics.image_height as f64 / metrics.effective_scale)
        .round()
        .max(1.0) as i32;
    (
        display_info.x,
        display_info.y,
        display_info.x.saturating_add(logical_width.saturating_sub(1)),
        display_info.y.saturating_add(logical_height.saturating_sub(1)),
    )
}

#[cfg(test)]
mod tests {
    use super::metrics_from_capture;
    use screenshots::display_info::DisplayInfo;

    fn sample_display(width: u32, height: u32, scale: f32) -> DisplayInfo {
        DisplayInfo {
            id: 0,
            raw_handle: Default::default(),
            x: 0,
            y: 0,
            width,
            height,
            scale_factor: scale,
            rotation: 0.0,
            frequency: 60.0,
            is_primary: true,
        }
    }

    #[test]
    fn metrics_prefers_derived_scale_when_reported_is_one() {
        let display = sample_display(1707, 960, 1.0);
        let metrics = metrics_from_capture(&display, 2560, 1440);
        assert!((metrics.effective_scale - 1.5).abs() < 0.02);
    }

    #[test]
    fn metrics_keeps_reported_scale_when_it_matches_capture() {
        let display = sample_display(2560, 1440, 1.0);
        let metrics = metrics_from_capture(&display, 2560, 1440);
        assert!((metrics.effective_scale - 1.0).abs() < 0.01);
    }
}
