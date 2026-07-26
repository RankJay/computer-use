//! Process DPI awareness for Windows desktop automation.
//!
//! Agent contract: Windows screen coords are **physical pixels**. That only holds
//! when the process is Per-Monitor DPI aware (V2 preferred). Call
//! [`ensure_dpi_awareness`] before the first user32 metrics/capture/cursor call.

/// Make this process Per-Monitor V2 aware when possible.
///
/// Idempotent. Safe no-op on non-Windows. On Windows, prefers
/// `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`; ignores "already set" failures
/// so a manifest-configured process still proceeds.
pub fn ensure_dpi_awareness() {
    #[cfg(windows)]
    {
        use std::sync::Once;
        use windows::Win32::UI::HiDpi::{
            SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        };

        static ONCE: Once = Once::new();
        ONCE.call_once(|| {
            // Manifest may already have set PMv2; API then fails — that is fine.
            let _ = unsafe {
                SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
            };
        });
    }
}

/// Human-readable awareness label for experiment JSON / diagnostics.
pub fn dpi_awareness_label() -> String {
    #[cfg(windows)]
    {
        use windows::Win32::UI::HiDpi::{
            AreDpiAwarenessContextsEqual, GetThreadDpiAwarenessContext,
            DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            DPI_AWARENESS_CONTEXT_SYSTEM_AWARE, DPI_AWARENESS_CONTEXT_UNAWARE,
            DPI_AWARENESS_CONTEXT_UNAWARE_GDISCALED,
        };

        let ctx = unsafe { GetThreadDpiAwarenessContext() };
        let eq = |other| unsafe { AreDpiAwarenessContextsEqual(ctx, other) }.as_bool();

        if eq(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) {
            "perMonitorV2".to_string()
        } else if eq(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE) {
            "perMonitor".to_string()
        } else if eq(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE) {
            "system".to_string()
        } else if eq(DPI_AWARENESS_CONTEXT_UNAWARE) || eq(DPI_AWARENESS_CONTEXT_UNAWARE_GDISCALED) {
            "unaware".to_string()
        } else {
            "unknown".to_string()
        }
    }
    #[cfg(target_os = "macos")]
    {
        "points_vs_device_pixels".to_string()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        "unsupported".to_string()
    }
}

/// True when Windows process is Per-Monitor aware (V1 or V2). Always true on macOS.
pub fn is_per_monitor_aware() -> bool {
    let label = dpi_awareness_label();
    matches!(
        label.as_str(),
        "perMonitorV2" | "perMonitor" | "points_vs_device_pixels"
    )
}
