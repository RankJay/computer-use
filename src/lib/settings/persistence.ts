import { TauriSettingsPersistence } from "@/lib/settings/adapters/tauri-persistence";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export type SettingsPersistence = {
  load(): Promise<LoadedSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveSecret(key: keyof AppSecrets, value: string): Promise<void>;
};

export function createSettingsPersistence(): SettingsPersistence {
  return new TauriSettingsPersistence();
}
