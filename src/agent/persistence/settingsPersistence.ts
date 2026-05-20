import { hostRuntime, type HostRuntime } from "@/agent/host/hostRuntime";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";

export {
  clampModelsForSave,
  DEFAULT_APP_SETTINGS,
  normalizeStoredSettings,
  settingsOrDefault,
} from "@/agent/persistence/settingsCodec";

export function settingsForRuntime(
  payload: AppSettingsPayload | null,
  runtime: HostRuntime = hostRuntime,
): AppSettingsPayload {
  return runtime.normalizeSettings(payload);
}

export async function loadAppSettings(
  runtime: HostRuntime = hostRuntime,
): Promise<AppSettingsPayload | null> {
  return runtime.loadSettings();
}

export async function saveAppSettings(
  settings: AppSettingsPayload,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  await runtime.saveSettings(settings);
}
