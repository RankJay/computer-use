export type MacOsPermissionKind = "accessibility" | "inputMonitoring" | "screenRecording";

export type MacOsPermissionStatus = {
  accessibility: boolean;
  inputMonitoring: boolean;
  screenRecording: boolean;
};

export type MacOsPermissionMeta = {
  kind: MacOsPermissionKind;
  label: string;
  description: string;
  granted: (status: MacOsPermissionStatus) => boolean;
};

export const MACOS_PERMISSIONS: readonly MacOsPermissionMeta[] = [
  {
    kind: "accessibility",
    label: "Accessibility",
    description: "Read UI and control other apps (required for click, type, and window tools).",
    granted: (status) => status.accessibility,
  },
  {
    kind: "inputMonitoring",
    label: "Input Monitoring",
    description: "Observe keyboard input used by some automation paths.",
    granted: (status) => status.inputMonitoring,
  },
  {
    kind: "screenRecording",
    label: "Screen Recording",
    description: "Read window titles and capture screen content when needed.",
    granted: (status) => status.screenRecording,
  },
] as const;

export function missingMacOsPermissions(
  status: MacOsPermissionStatus,
): readonly MacOsPermissionMeta[] {
  return MACOS_PERMISSIONS.filter((permission) => !permission.granted(status));
}
