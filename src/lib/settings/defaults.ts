import { getDefaultAgentModelId } from "@/lib/agent-models";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

/** Values below one minute were often saved as seconds (e.g. 900 meaning 15 minutes). */
export function normalizeMaxWallClockMs(ms: number): number {
  if (ms === 0) {
    return 0;
  }

  if (ms > 0 && ms < 60_000) {
    return ms * 1000;
  }

  return ms;
}

export const DEFAULT_SETTINGS: AppSettings = {
  workspaceRoot: "",
  logRetentionDays: 30,
  permissionMode: "risky",
  uiAutomation: false,
  agentMode: "live",
  selectedModelId: getDefaultAgentModelId(),
  maxSteps: 50,
  maxCostUsd: 5,
  maxWallClockMs: 900_000,
  persistedApprovals: [],
};

export const DEFAULT_SECRETS: AppSecrets = {
  anthropicApiKey: "",
  openaiApiKey: "",
};

export function settingsOrDefault(partial: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...partial };
  return {
    ...merged,
    maxWallClockMs: normalizeMaxWallClockMs(merged.maxWallClockMs),
  };
}

export function loadedSettingsOrDefault(
  partial: Partial<LoadedSettings> | null | undefined,
): LoadedSettings {
  return {
    ...settingsOrDefault(partial),
    secrets: { ...DEFAULT_SECRETS, ...partial?.secrets },
  };
}
