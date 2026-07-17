import type { AppSecrets, LoadedSettings } from "@/lib/settings/types";

export function selectWorkspaceRoot(settings: LoadedSettings): string {
  return settings.workspaceRoot;
}

export function selectLogRetentionDays(settings: LoadedSettings): number {
  return settings.logRetentionDays;
}

export function selectPermissionMode(settings: LoadedSettings): LoadedSettings["permissionMode"] {
  return settings.permissionMode;
}

export function selectUiAutomation(settings: LoadedSettings): boolean {
  return settings.uiAutomation;
}

export function selectAgentMode(settings: LoadedSettings): LoadedSettings["agentMode"] {
  return settings.agentMode;
}

export function selectSelectedModelId(settings: LoadedSettings): string {
  return settings.selectedModelId;
}

export function selectMaxSteps(settings: LoadedSettings): number {
  return settings.maxSteps;
}

export function selectMaxCostUsd(settings: LoadedSettings): number {
  return settings.maxCostUsd;
}

export function selectMaxWallClockMs(settings: LoadedSettings): number {
  return settings.maxWallClockMs;
}

export function selectHasPersistedApprovals(settings: LoadedSettings): boolean {
  return settings.persistedApprovals.length > 0;
}

export const selectSecretIsSaved = {
  anthropicApiKey: (settings: LoadedSettings) => settings.secrets.anthropicApiKey.length > 0,
  openaiApiKey: (settings: LoadedSettings) => settings.secrets.openaiApiKey.length > 0,
} satisfies Record<keyof AppSecrets, (settings: LoadedSettings) => boolean>;
