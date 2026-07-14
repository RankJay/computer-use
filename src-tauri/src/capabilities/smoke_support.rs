//! Shared helpers for ignored live-desktop smoke tests.

/// Assert macOS Accessibility (and optionally post-event) grants before smokes run.
#[cfg(target_os = "macos")]
pub fn require_macos_automation(need_post_events: bool) {
    use objc2_application_services::AXIsProcessTrusted;
    use objc2_core_graphics::CGPreflightPostEventAccess;

    assert!(
        unsafe { AXIsProcessTrusted() },
        "Grant Accessibility to the process running cargo test (Terminal / IDE) under System Settings → Privacy & Security → Accessibility"
    );

    if need_post_events {
        assert!(
            CGPreflightPostEventAccess(),
            "Grant Accessibility to the process running cargo test under System Settings → Privacy & Security → Accessibility"
        );
    }
}

#[cfg(not(target_os = "macos"))]
pub fn require_macos_automation(_need_post_events: bool) {}
