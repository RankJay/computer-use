import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";

let signaled = false;

/**
 * Tell Rust the first meaningful frame is painted so the main window can show.
 * Idempotent — safe to call from StrictMode double-mount.
 */
export function signalAppReady(): void {
  if (signaled || !isTauriRuntime()) return;
  signaled = true;

  // Wait two frames so Suspense content (settings-backed UI) has painted.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void invoke("app_ready").catch(() => {
        // Non-fatal: Rust also has a reveal timeout.
      });
    });
  });
}
