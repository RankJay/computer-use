import type { SessionEngine } from "./engine";

let activeEngine: SessionEngine | null = null;

/** Register the home-page session engine for Maintenance reset_session. */
export function setActiveSessionEngine(engine: SessionEngine | null): void {
  activeEngine = engine;
}

export function getActiveSessionEngine(): SessionEngine | null {
  return activeEngine;
}

export async function resetActiveSessionEngine(): Promise<void> {
  await activeEngine?.reset();
}
