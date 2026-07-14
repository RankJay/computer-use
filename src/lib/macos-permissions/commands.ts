import { invoke } from "@tauri-apps/api/core";

import type { MacOsPermissionKind, MacOsPermissionStatus } from "@/lib/macos-permissions/types";

export type { MacOsPermissionKind, MacOsPermissionStatus };

export function getMacOsPermissionStatus(): Promise<MacOsPermissionStatus> {
  return invoke<MacOsPermissionStatus>("get_macos_permission_status");
}

export function requestMacOsPermission(kind: MacOsPermissionKind): Promise<MacOsPermissionStatus> {
  return invoke<MacOsPermissionStatus>("request_macos_permission", { kind });
}

export function openMacOsPrivacySettings(kind: MacOsPermissionKind): Promise<void> {
  return invoke<void>("open_macos_privacy_settings", { kind });
}
