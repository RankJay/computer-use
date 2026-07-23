import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

type GetEnvResult = {
  name: string;
  value: string | null;
  set: boolean;
};

/** Inputs for updater enablement — kept explicit so tests don't need `mock.module`. */
export type UpdaterEnablementInput = {
  isTauri: boolean;
  isDev: boolean;
  viteUpdaterFlag: string | undefined;
  readActuateUpdaterEnv: () => Promise<string | null>;
};

/**
 * Updater runs in packaged builds. In `tauri dev` / Vite, opt in with
 * `ACTUATE_UPDATER=1` (or `VITE_ACTUATE_UPDATER=1`).
 */
export async function resolveUpdaterEnabled(input: UpdaterEnablementInput): Promise<boolean> {
  if (!input.isTauri) {
    return false;
  }

  if (!input.isDev) {
    return true;
  }

  if (input.viteUpdaterFlag === "1") {
    return true;
  }

  try {
    return (await input.readActuateUpdaterEnv()) === "1";
  } catch {
    return false;
  }
}

/** Production entry — wires runtime + env + invoke into {@link resolveUpdaterEnabled}. */
export async function isUpdaterEnabled(): Promise<boolean> {
  return resolveUpdaterEnabled({
    isTauri: isTauriRuntime(),
    isDev: import.meta.env.DEV,
    viteUpdaterFlag: import.meta.env.VITE_ACTUATE_UPDATER,
    readActuateUpdaterEnv: async () => {
      const result = await invoke<GetEnvResult>("get_env", { name: "ACTUATE_UPDATER" });
      return result.value;
    },
  });
}
