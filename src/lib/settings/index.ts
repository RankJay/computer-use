export type {
  AgentMode,
  AppSecrets,
  AppSettings,
  LoadedSettings,
  PermissionMode,
  SettingsSelectOption,
} from "./types";
export {
  agentModeSchema,
  appSecretsSchema,
  appSettingsPartialSchema,
  appSettingsSchema,
  permissionModeSchema,
} from "./types";

export type { SettingsPersistence } from "./persistence";
export { createSettingsPersistence } from "./persistence";

export { TauriSettingsPersistence } from "./adapters/tauri-persistence";

export {
  DEFAULT_SECRETS,
  DEFAULT_SETTINGS,
  loadedSettingsOrDefault,
  mergeSettingsPatch,
  normalizeMaxWallClockMs,
  settingsOrDefault,
} from "./defaults";

export {
  ensureSecretsReady,
  scheduleSecretsHydration,
  settingsKeys,
  settingsQueryOptions,
  useLoadedSettings,
  usePersistToolApproval,
  useSettingsSelector,
  useUpdateSecret,
  useUpdateSettings,
} from "./queries";

export {
  selectAgentMode,
  selectHasPersistedApprovals,
  selectHasProviderApiKey,
  selectHasWorkspaceRoot,
  selectInstallUpdateOnClose,
  selectLogRetentionDays,
  selectMaxCostUsd,
  selectMaxSteps,
  selectMaxWallClockMs,
  selectPermissionMode,
  selectSecretIsSaved,
  selectSelectedModelId,
  selectSetupProgress,
  selectUiAutomation,
  selectWorkspaceRoot,
} from "./selectors";
export type { SetupProgress } from "./selectors";

export { SETTINGS_SECTION_IDS, settingsSectionHref } from "./section-ids";
export type { SettingsSectionId } from "./section-ids";

export { expectedApiKeyPrefix, sanitizeApiKey, validateApiKeyFormat } from "./api-key";
export {
  AGENT_MODE_OPTIONS,
  parseAgentMode,
  parsePermissionMode,
  PERMISSION_MODE_OPTIONS,
  wallClockMinutesFromMs,
  wallClockMsFromMinutes,
} from "./options";
export { pickWorkspaceFolder } from "./workspace-picker";

export { clearLogs, openLogsFolder, resetSession } from "./maintenance/commands";
export { useClearLogs, useOpenLogsFolder, useResetSession } from "./maintenance/queries";
