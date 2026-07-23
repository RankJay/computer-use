import { listen } from "@tauri-apps/api/event";

import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";
import { queryClient } from "@/lib/runtime/query-client";
import { settingsKeys, settingsQueryOptions } from "@/lib/settings/queries";
import type { LoadedSettings } from "@/lib/settings/types";
import { handleQuitRequested, startLaunchUpdateCheck } from "@/lib/updater/service";

let started = false;

function readInstallUpdateOnClose(): boolean {
  return (
    queryClient.getQueryData<LoadedSettings>(settingsKeys.loaded())?.installUpdateOnClose ?? false
  );
}

/**
 * Once per app load: launch update check + quit hook.
 * Call during render (module-guarded); no React effects or settings subscriptions.
 */
export function startUpdaterRuntime(): void {
  if (started || !isTauriRuntime()) {
    return;
  }
  started = true;

  void queryClient
    .ensureQueryData(settingsQueryOptions())
    .then((settings) => {
      void startLaunchUpdateCheck(settings.installUpdateOnClose);
      return undefined;
    })
    .catch(() => {
      void startLaunchUpdateCheck(false);
    });

  void listen("quit-requested", () => {
    void handleQuitRequested(readInstallUpdateOnClose());
  });
}
