import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export const DEFAULT_SETTINGS: AppSettings = {
  workspaceRoot: "",
  logRetentionDays: 30,
  permissionMode: "risky",
  uiAutomation: false,
  agentMode: "live",
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
  return { ...DEFAULT_SETTINGS, ...partial };
}

export function loadedSettingsOrDefault(
  partial: Partial<LoadedSettings> | null | undefined,
): LoadedSettings {
  return {
    ...settingsOrDefault(partial),
    secrets: { ...DEFAULT_SECRETS, ...partial?.secrets },
  };
}
