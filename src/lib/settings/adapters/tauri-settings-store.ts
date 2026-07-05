import { LazyStore } from "@tauri-apps/plugin-store";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import type { AppSettings } from "@/lib/settings/types";

const SETTINGS_STORE_PATH = "settings.json";
const SETTINGS_KEY = "app";

const settingsStore = new LazyStore(SETTINGS_STORE_PATH, {
  defaults: { [SETTINGS_KEY]: DEFAULT_SETTINGS },
  autoSave: 100,
});

export async function readAppSettings(): Promise<AppSettings> {
  await settingsStore.init();
  const stored = await settingsStore.get<AppSettings>(SETTINGS_KEY);
  return stored ?? DEFAULT_SETTINGS;
}

export async function writeAppSettings(settings: AppSettings): Promise<void> {
  await settingsStore.init();
  await settingsStore.set(SETTINGS_KEY, settings);
}
