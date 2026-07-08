import type { AgentMode, SettingsSelectOption, PermissionMode } from "@/lib/settings/types";

export const AGENT_MODE_OPTIONS: SettingsSelectOption<AgentMode>[] = [
  { value: "live", label: "Live" },
  { value: "demo", label: "Demo" },
];

export const PERMISSION_MODE_OPTIONS: SettingsSelectOption<PermissionMode>[] = [
  { value: "risky", label: "Ask before risky actions" },
  { value: "every-meaningful", label: "Ask before every action" },
  { value: "once-per-class", label: "Ask once per class" },
];

export function parseAgentMode(value: string): AgentMode {
  switch (value) {
    case "live":
    case "demo":
      return value;
    default:
      return "live";
  }
}

/** Stored as ms; settings UI edits in whole minutes. */

export function wallClockMinutesFromMs(ms: number): string {
  if (ms === 0) {
    return "0";
  }
  return String(Math.round(ms / 60_000));
}

export function wallClockMsFromMinutes(minutes: number): number {
  if (minutes === 0) {
    return 0;
  }
  return minutes * 60_000;
}

export function parsePermissionMode(value: string): PermissionMode {
  switch (value) {
    case "risky":
    case "every-meaningful":
    case "once-per-class":
      return value;
    default:
      return "risky";
  }
}
