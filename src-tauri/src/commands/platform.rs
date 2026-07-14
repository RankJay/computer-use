//! Runtime OS capability map for agent catalog gating (no UA sniffing).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilityGroups {
    pub file_system: bool,
    pub shell: bool,
    pub clipboard: bool,
    pub window: bool,
    pub input: bool,
    pub accessibility: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPermissions {
    pub accessibility_trusted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub os: &'static str,
    pub groups: PlatformCapabilityGroups,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<PlatformPermissions>,
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    platform_capabilities()
}

fn platform_capabilities() -> PlatformCapabilities {
    #[cfg(target_os = "windows")]
    {
        PlatformCapabilities {
            os: "windows",
            groups: PlatformCapabilityGroups {
                file_system: true,
                shell: true,
                clipboard: true,
                window: true,
                input: true,
                accessibility: true,
            },
            permissions: None,
        }
    }

    #[cfg(target_os = "macos")]
    {
        use objc2_application_services::AXIsProcessTrusted;

        PlatformCapabilities {
            os: "macos",
            groups: PlatformCapabilityGroups {
                file_system: true,
                shell: true,
                clipboard: true,
                window: true,
                input: true,
                accessibility: true,
            },
            permissions: Some(PlatformPermissions {
                accessibility_trusted: unsafe { AXIsProcessTrusted() },
            }),
        }
    }

    #[cfg(target_os = "linux")]
    {
        PlatformCapabilities {
            os: "linux",
            groups: PlatformCapabilityGroups {
                file_system: true,
                shell: true,
                clipboard: true,
                window: false,
                input: false,
                accessibility: false,
            },
            permissions: None,
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        PlatformCapabilities {
            os: "unknown",
            groups: PlatformCapabilityGroups {
                file_system: true,
                shell: true,
                clipboard: true,
                window: false,
                input: false,
                accessibility: false,
            },
            permissions: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_current_os_groups() {
        let caps = platform_capabilities();
        assert!(caps.groups.file_system);
        assert!(caps.groups.shell);
        assert!(caps.groups.clipboard);

        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            assert!(matches!(caps.os, "windows" | "macos"));
            assert!(caps.groups.window);
            assert!(caps.groups.input);
            assert!(caps.groups.accessibility);
        }

        #[cfg(target_os = "macos")]
        {
            assert!(caps.permissions.is_some());
        }

        #[cfg(target_os = "linux")]
        {
            assert_eq!(caps.os, "linux");
            assert!(!caps.groups.window);
            assert!(!caps.groups.input);
            assert!(!caps.groups.accessibility);
        }
    }
}
