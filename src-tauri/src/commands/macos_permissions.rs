//! macOS TCC permission status + request helpers for Settings.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::capabilities::error::{CommandError, ErrorCode};

const MACOS_ONLY: &str = "macOS permissions are only available on macOS";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MacOsPermissionKind {
    Accessibility,
    ScreenRecording,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacOsPermissionStatus {
    pub accessibility: bool,
    pub screen_recording: bool,
}

#[tauri::command]
pub fn get_macos_permission_status() -> Result<MacOsPermissionStatus, CommandError> {
    #[cfg(target_os = "macos")]
    {
        Ok(macos::read_status())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(CommandError::new(
            ErrorCode::UnsupportedPlatform,
            MACOS_ONLY,
        ))
    }
}

/// Prompt for a missing permission when the OS supports it, then open the matching System Settings pane.
#[tauri::command]
pub fn request_macos_permission(
    app: AppHandle,
    kind: MacOsPermissionKind,
) -> Result<MacOsPermissionStatus, CommandError> {
    #[cfg(target_os = "macos")]
    {
        macos::request(kind);
        macos::open_privacy_pane(&app, kind)?;
        Ok(macos::read_status())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, kind);
        Err(CommandError::new(
            ErrorCode::UnsupportedPlatform,
            MACOS_ONLY,
        ))
    }
}

/// Open the System Settings privacy pane for a permission without prompting.
#[tauri::command]
pub fn open_macos_privacy_settings(
    app: AppHandle,
    kind: MacOsPermissionKind,
) -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    {
        macos::open_privacy_pane(&app, kind)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, kind);
        Err(CommandError::new(
            ErrorCode::UnsupportedPlatform,
            MACOS_ONLY,
        ))
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2_application_services::{
        kAXTrustedCheckOptionPrompt, AXIsProcessTrusted, AXIsProcessTrustedWithOptions,
    };
    use objc2_core_foundation::{CFBoolean, CFDictionary, CFString};
    use objc2_core_graphics::{CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess};
    use tauri::AppHandle;
    use tauri_plugin_opener::OpenerExt;

    use super::{MacOsPermissionKind, MacOsPermissionStatus};
    use crate::capabilities::error::{CommandError, ErrorCode};

    pub(super) fn read_status() -> MacOsPermissionStatus {
        MacOsPermissionStatus {
            accessibility: unsafe { AXIsProcessTrusted() },
            screen_recording: CGPreflightScreenCaptureAccess(),
        }
    }

    pub(super) fn request(kind: MacOsPermissionKind) {
        match kind {
            MacOsPermissionKind::Accessibility => prompt_accessibility(),
            MacOsPermissionKind::ScreenRecording => {
                let _ = CGRequestScreenCaptureAccess();
            }
        }
    }

    fn prompt_accessibility() {
        // Prompts asynchronously; return value is current trust state only.
        let options = CFDictionary::<CFString, CFBoolean>::from_slices(
            &[unsafe { kAXTrustedCheckOptionPrompt }],
            &[CFBoolean::new(true)],
        );
        let _ = unsafe { AXIsProcessTrustedWithOptions(Some(options.as_ref())) };
    }

    fn privacy_url(kind: MacOsPermissionKind) -> &'static str {
        match kind {
            MacOsPermissionKind::Accessibility => {
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility"
            }
            MacOsPermissionKind::ScreenRecording => {
                "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture"
            }
        }
    }

    pub(super) fn open_privacy_pane(
        app: &AppHandle,
        kind: MacOsPermissionKind,
    ) -> Result<(), CommandError> {
        app.opener()
            .open_url(privacy_url(kind), None::<&str>)
            .map_err(|error| {
                CommandError::new(ErrorCode::OpenFailed, "Failed to open System Settings")
                    .with_details(error.to_string())
            })
    }
}
