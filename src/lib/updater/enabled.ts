import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";

type GetEnvResult = {
  name: string;
  value: string | null;
  set: boolean;
};

/**
 * Updater runs in packaged builds. In `tauri dev` / Vite, opt in with
 * `ACTUATE_UPDATER=1` (or `VITE_ACTUATE_UPDATER=1`).
 */
export async function isUpdaterEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }

  if (!import.meta.env.DEV) {
    return true;
  }

  if (import.meta.env.VITE_ACTUATE_UPDATER === "1") {
    return true;
  }

  try {
    const result = await invoke<GetEnvResult>("get_env", { name: "ACTUATE_UPDATER" });
    return result.value === "1";
  } catch {
    return false;
  }
}
