import { TauriSettingsPersistence } from "@/lib/settings/adapters/tauri-persistence";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export type SettingsPersistence = {
  /** Settings store only — must not block on Stronghold. */
  load(): Promise<LoadedSettings>;
  /** Vault read — call before live agent start / API key UI that needs real secrets. */
  loadSecrets(): Promise<AppSecrets>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveSecret(key: keyof AppSecrets, value: string): Promise<void>;
};

export function createSettingsPersistence(): SettingsPersistence {
  return new TauriSettingsPersistence();
}
