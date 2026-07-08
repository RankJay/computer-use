import { readAppSecrets, writeAppSecret } from "@/lib/settings/adapters/tauri-secrets-store";
import { readAppSettings, writeAppSettings } from "@/lib/settings/adapters/tauri-settings-store";
import type { SettingsPersistence } from "@/lib/settings/persistence";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export class TauriSettingsPersistence implements SettingsPersistence {
  async load(): Promise<LoadedSettings> {
    const [settings, secrets] = await Promise.all([readAppSettings(), readAppSecrets()]);
    return { ...settings, secrets };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await writeAppSettings(settings);
  }

  async saveSecret(key: keyof AppSecrets, value: string): Promise<void> {
    await writeAppSecret(key, value);
  }
}
