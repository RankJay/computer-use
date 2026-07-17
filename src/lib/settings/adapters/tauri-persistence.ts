import { readAppSecrets, writeAppSecret } from "@/lib/settings/adapters/tauri-secrets-store";
import { readAppSettings, writeAppSettings } from "@/lib/settings/adapters/tauri-settings-store";
import { DEFAULT_SECRETS } from "@/lib/settings/defaults";
import type { SettingsPersistence } from "@/lib/settings/persistence";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

/**
 * Fast path for first paint: settings store only.
 * Secrets (Stronghold) hydrate in the background via settings/queries.
 */
export class TauriSettingsPersistence implements SettingsPersistence {
  async load(): Promise<LoadedSettings> {
    const settings = await readAppSettings();
    return { ...settings, secrets: { ...DEFAULT_SECRETS } };
  }

  async loadSecrets(): Promise<AppSecrets> {
    return readAppSecrets();
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await writeAppSettings(settings);
  }

  async saveSecret(key: keyof AppSecrets, value: string): Promise<void> {
    await writeAppSecret(key, value);
  }
}
