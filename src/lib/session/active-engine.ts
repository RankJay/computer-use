import type { BatchedAttemptStore } from "./attempt-host";

let attemptHost: BatchedAttemptStore | null = null;

/** Register the app-runtime Attempt host (tray-kept webview). */
export function registerAttemptHost(host: BatchedAttemptStore | null): void {
  attemptHost = host;
}

export function getAttemptHost(): BatchedAttemptStore | null {
  return attemptHost;
}

/** Maintenance reset: cancel focused live Attempt + clear in-memory projection; durable kept. */
export async function resetAttemptHost(): Promise<void> {
  await attemptHost?.resetForMaintenance();
}
