import type { AppSecrets, LoadedSettings } from "@/lib/settings/types";

export type GeneralSettingsSlice = Pick<
  LoadedSettings,
  "workspaceRoot" | "logRetentionDays" | "permissionMode" | "uiAutomation"
>;

export type GuardrailSettingsSlice = Pick<
  LoadedSettings,
  "agentMode" | "maxSteps" | "maxCostUsd" | "maxWallClockMs"
>;

export function selectGeneralSettings(settings: LoadedSettings): GeneralSettingsSlice {
  return {
    workspaceRoot: settings.workspaceRoot,
    logRetentionDays: settings.logRetentionDays,
    permissionMode: settings.permissionMode,
    uiAutomation: settings.uiAutomation,
  };
}

export function selectGuardrailSettings(settings: LoadedSettings): GuardrailSettingsSlice {
  return {
    agentMode: settings.agentMode,
    maxSteps: settings.maxSteps,
    maxCostUsd: settings.maxCostUsd,
    maxWallClockMs: settings.maxWallClockMs,
  };
}

export function selectHasPersistedApprovals(settings: LoadedSettings): boolean {
  return settings.persistedApprovals.length > 0;
}

export const selectSecretIsSaved = {
  anthropicApiKey: (settings: LoadedSettings) => settings.secrets.anthropicApiKey.length > 0,
  openaiApiKey: (settings: LoadedSettings) => settings.secrets.openaiApiKey.length > 0,
} satisfies Record<keyof AppSecrets, (settings: LoadedSettings) => boolean>;
