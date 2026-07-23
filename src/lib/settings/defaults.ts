import { getDefaultAgentModelId } from "@/lib/agent/agent-models";
import {
  appSecretsSchema,
  appSettingsPartialSchema,
  appSettingsSchema,
  type AppSecrets,
  type AppSettings,
  type LoadedSettings,
} from "@/lib/settings/types";

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
  permissionMode: "destructive-only",
  uiAutomation: true,
  agentMode: "live",
  selectedModelId: getDefaultAgentModelId(),
  maxSteps: 50,
  maxCostUsd: 5,
  maxWallClockMs: 900_000,
  persistedApprovals: [],
  installUpdateOnClose: false,
};

export const DEFAULT_SECRETS: AppSecrets = {
  anthropicApiKey: "",
  openaiApiKey: "",
};

/** Merge unknown/partial disk settings with defaults; Zod validates the result. */
export function settingsOrDefault(partial: unknown): AppSettings {
  const loose = appSettingsPartialSchema.safeParse(
    partial === null || partial === undefined ? {} : partial,
  );
  const patch = loose.success ? loose.data : {};
  const merged = {
    ...DEFAULT_SETTINGS,
    ...patch,
    maxWallClockMs: normalizeMaxWallClockMs(
      patch.maxWallClockMs ?? DEFAULT_SETTINGS.maxWallClockMs,
    ),
  };
  const parsed = appSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
}

export function mergeSettingsPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return settingsOrDefault({ ...current, ...patch });
}

export function loadedSettingsOrDefault(partial: unknown): LoadedSettings {
  const settings = settingsOrDefault(partial);
  const secretsLoose =
    typeof partial === "object" &&
    partial !== null &&
    "secrets" in partial &&
    typeof partial.secrets === "object" &&
    partial.secrets !== null
      ? partial.secrets
      : {};
  const secretsParsed = appSecretsSchema.partial().safeParse(secretsLoose);
  const secretsPatch = secretsParsed.success ? secretsParsed.data : {};
  return {
    ...settings,
    secrets: { ...DEFAULT_SECRETS, ...secretsPatch },
  };
}
