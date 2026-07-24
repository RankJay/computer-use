import { createStallWatchdog, type StallWatchdog } from "@/lib/triggers/stall-watchdog";

import type { RunStatus } from "./events";
import { isAgentProgressStatus, isLiveRun } from "./run-status";

/** Default: 1.5 minutes without progress → cancel. */
export const DEFAULT_STALL_AFTER_MS = 90_000;

/** How often to poll the watchdog while the agent is producing. */
export const DEFAULT_STALL_POLL_INTERVAL_MS = 5_000;

export type StallBridgeDeps = {
  getStatus: () => RunStatus;
  cancel: () => Promise<void>;
  stallAfterMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

export type StallBridge = {
  /** Call from the host's engine subscription. */
  onProjection: () => void;
  /** Stop the poll timer (maintenance / host teardown). */
  dispose: () => void;
  /** Test / diagnostics seam. */
  poll: (nowMs?: number) => { stalled: boolean };
};

/**
 * Progress stall bridge (ops-contract §5): beat while running/streaming;
 * pause during waiting_interaction; cancel once when stalled.
 */
export function createStallBridge(deps: StallBridgeDeps): StallBridge {
  const stallAfterMs = deps.stallAfterMs ?? DEFAULT_STALL_AFTER_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_STALL_POLL_INTERVAL_MS;
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let cancelInFlight = false;

  const watchdog: StallWatchdog = createStallWatchdog({
    stallAfterMs,
    now: deps.now,
    onStalled: () => {
      if (cancelInFlight) {
        return;
      }
      cancelInFlight = true;
      void deps.cancel().finally(() => {
        cancelInFlight = false;
      });
    },
  });

  function stopPoll(): void {
    if (pollTimer !== null) {
      clearIntervalFn(pollTimer);
      pollTimer = null;
    }
  }

  function ensurePoll(): void {
    if (pollTimer !== null) {
      return;
    }
    pollTimer = setIntervalFn(() => {
      if (!isAgentProgressStatus(deps.getStatus())) {
        stopPoll();
        return;
      }
      watchdog.poll();
    }, pollIntervalMs);
  }

  return {
    poll: (nowMs) => watchdog.poll(nowMs),
    dispose: () => {
      stopPoll();
      watchdog.reset();
    },
    onProjection: () => {
      const status = deps.getStatus();
      if (isAgentProgressStatus(status)) {
        watchdog.beat();
        ensurePoll();
        return;
      }
      stopPoll();
      if (!isLiveRun(status)) {
        watchdog.reset();
      }
    },
  };
}
