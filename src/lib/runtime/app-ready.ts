import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "./is-tauri-runtime";
import { isMacOsClient } from "./platform";

let signaled = false;

function invokeAppReady(): void {
  void invoke("app_ready").catch(() => {
    // Non-fatal: Rust also has a reveal timeout.
  });
}

/**
 * Tell Rust the first meaningful frame is painted so the main window can show.
 * Idempotent — safe to call from StrictMode double-mount.
 *
 * macOS WKWebView pauses rAF while `visible: false` (document.hidden), so
 * waiting on frames never resolves and we hit the Rust 8s reveal timeout.
 */
export function signalAppReady(): void {
  if (signaled || !isTauriRuntime()) return;
  signaled = true;

  // Skip rAF on macOS cold start — frames do not fire until the window shows.
  if (isMacOsClient() && typeof document !== "undefined" && document.visibilityState === "hidden") {
    invokeAppReady();
    return;
  }

  // Wait two frames so Suspense content (settings-backed UI) has painted.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      invokeAppReady();
    });
  });
}

/** Clears the one-shot latch so unit tests can call `signalAppReady` again. */
export function resetAppReadyForTests(): void {
  signaled = false;
}
