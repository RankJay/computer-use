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
