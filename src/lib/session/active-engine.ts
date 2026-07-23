import type { BatchedAttemptStore } from "./attempt-host";
import type { SessionEngine } from "./engine";

let activeEngine: SessionEngine | null = null;
let attemptHost: BatchedAttemptStore | null = null;

/** Register the app-runtime Attempt host (preferred). */
export function registerAttemptHost(host: BatchedAttemptStore | null): void {
  attemptHost = host;
  activeEngine = host?.engine ?? null;
}

/** @deprecated Prefer registerAttemptHost — kept for tests that only set an engine. */
export function setActiveSessionEngine(engine: SessionEngine | null): void {
  if (attemptHost) {
    return;
  }
  activeEngine = engine;
}

export function getActiveSessionEngine(): SessionEngine | null {
  return activeEngine;
}

export function getAttemptHost(): BatchedAttemptStore | null {
  return attemptHost;
}

/** Maintenance reset: cancel focused live Attempt + clear in-memory projection; durable kept. */
export async function resetActiveSessionEngine(): Promise<void> {
  if (attemptHost) {
    await attemptHost.resetForMaintenance();
    return;
  }
  await activeEngine?.reset();
}
