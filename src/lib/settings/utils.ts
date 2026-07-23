import {
  agentModeSchema,
  permissionModeSchema,
  type AgentMode,
  type SettingsSelectOption,
  type PermissionMode,
} from "@/lib/settings/types";

export const AGENT_MODE_OPTIONS: SettingsSelectOption<AgentMode>[] = [
  { value: "live", label: "Live" },
  { value: "demo", label: "Demo" },
];

export const PERMISSION_MODE_OPTIONS: SettingsSelectOption<PermissionMode>[] = [
  { value: "every-meaningful", label: "Ask before every action" },
  { value: "risky", label: "Ask before risky actions" },
  { value: "destructive-only", label: "Ask only before destructive" },
  { value: "once-per-class", label: "Ask once per class" },
];

export function parseAgentMode(value: string): AgentMode {
  const parsed = agentModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "live";
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
  const parsed = permissionModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "risky";
}
