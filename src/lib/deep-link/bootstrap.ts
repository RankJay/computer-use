import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import { parseActuateDeepLinks } from "@/lib/deep-link/parse";
import { dispatchDeepLink, type DeepLinkSource } from "@/lib/deep-link/router";

let listenerStarted = false;
let coldStartConsumed = false;
let unlisten: (() => void) | null = null;

async function handleUrls(urls: readonly string[], source: DeepLinkSource): Promise<void> {
  const links = parseActuateDeepLinks(urls);
  for (const link of links) {
    try {
      await dispatchDeepLink(link, source);
    } catch {
      // Handlers should catch their own errors; this is a last-resort guard.
    }
  }
}

/**
 * Start the native deep-link listener once per process.
 * Feature handlers register via `registerDeepLinkHandler` — this module stays auth-agnostic.
 */
export async function startDeepLinkBootstrap(): Promise<void> {
  if (!isTauriRuntime() || listenerStarted) {
    return;
  }
  listenerStarted = true;

  if (!coldStartConsumed) {
    coldStartConsumed = true;
    try {
      const startUrls = await getCurrent();
      if (startUrls?.length) {
        void handleUrls(startUrls, "cold-start");
      }
    } catch {
      // Cold-start URL read is best-effort.
    }
  }

  try {
    unlisten = await onOpenUrl((urls) => {
      void handleUrls(urls, "open");
    });
  } catch {
    listenerStarted = false;
    unlisten = null;
  }
}

/** Test-only reset. */
export function stopDeepLinkBootstrapForTests(): void {
  unlisten?.();
  unlisten = null;
  listenerStarted = false;
  coldStartConsumed = false;
}
