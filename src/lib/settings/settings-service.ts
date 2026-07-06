import { createSettingsPersistence } from "@/lib/settings/create-persistence";
import { settingsOrDefault } from "@/lib/settings/defaults";
import type { SettingsPersistence } from "@/lib/settings/ports";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export type SettingsService = {
  initSettings: () => Promise<LoadedSettings>;
  getCachedSettings: () => LoadedSettings | null;
  saveSettings: (patch: Partial<AppSettings>) => Promise<LoadedSettings>;
  saveSecret: (key: keyof AppSecrets, value: string) => Promise<LoadedSettings>;
  refreshSettings: () => Promise<LoadedSettings>;
};

function stripSecrets(settings: LoadedSettings): AppSettings {
  const { secrets: _secrets, ...appSettings } = settings;
  return appSettings;
}

export function createSettingsService(persistence: SettingsPersistence): SettingsService {
  let cached: LoadedSettings | null = null;

  return {
    async initSettings() {
      const loaded = await persistence.load();
      cached = {
        ...settingsOrDefault(loaded),
        secrets: loaded.secrets,
      };
      return cached;
    },

    getCachedSettings() {
      return cached;
    },

    async saveSettings(patch) {
      const current = cached ?? (await persistence.load());
      const nextSettings = settingsOrDefault({ ...stripSecrets(current), ...patch });
      await persistence.saveSettings(nextSettings);
      cached = { ...nextSettings, secrets: current.secrets };
      return cached;
    },

    async saveSecret(key, value) {
      const current = cached ?? (await persistence.load());
      await persistence.saveSecret(key, value);
      cached = {
        ...stripSecrets(current),
        secrets: { ...current.secrets, [key]: value },
      };
      return cached;
    },

    async refreshSettings() {
      cached = await persistence.load();
      return cached;
    },
  };
}

export const settingsService = createSettingsService(createSettingsPersistence());
