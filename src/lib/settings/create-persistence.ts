import { TauriSettingsPersistence } from "@/lib/settings/adapters/tauri-persistence";
import type { SettingsPersistence } from "@/lib/settings/ports";

export function createSettingsPersistence(): SettingsPersistence {
  return new TauriSettingsPersistence();
}
