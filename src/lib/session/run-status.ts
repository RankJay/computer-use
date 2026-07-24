import type { RunStatus } from "./events";

/** Attempt is in-flight (engine slot / OS lease / UI cancel). */
export function isLiveRun(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_interaction";
}

/** Ledger settle snapshot — includes cancelled. */
export function shouldSettleLedger(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * Chat metadata checkpoint — excludes cancelled so cancel-then-retry
 * does not persist a partial title update.
 */
export function shouldCheckpointChat(status: RunStatus): boolean {
  return status === "completed" || status === "failed";
}
