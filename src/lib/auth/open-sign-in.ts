import { openUrl } from "@tauri-apps/plugin-opener";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import { getSignInUrl } from "@/lib/auth/config";

/** Open the web login page in the system browser. */
export async function openSignInInBrowser(): Promise<void> {
  const url = getSignInUrl();
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
