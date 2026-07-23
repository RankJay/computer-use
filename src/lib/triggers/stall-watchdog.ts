/**
 * Progress stall detector for live Attempts (ops-contract §5).
 * Tokio/Rust may host the timer later; this port is clock-injectable for tests.
 * PID/process alive ≠ healthy — callers supply last progress timestamp.
 */

export type StallWatchdog = {
  /** Call when a durable/progress fact is observed. */
  beat: (atMs?: number) => void;
  /** Check once; returns whether stalled and invokes onStalled at most once until beat. */
  poll: (nowMs?: number) => { stalled: boolean };
  /** Clear stalled latch after recovery handling. */
  reset: () => void;
};

export type CreateStallWatchdogDeps = {
  stallAfterMs: number;
  now?: () => number;
  onStalled?: () => void;
  /** Initial last-progress time (default: now). */
  initialProgressAtMs?: number;
};

export function createStallWatchdog(deps: CreateStallWatchdogDeps): StallWatchdog {
  const now = deps.now ?? Date.now;
  let lastProgressAt = deps.initialProgressAtMs ?? now();
  let fired = false;

  return {
    beat(atMs) {
      lastProgressAt = atMs ?? now();
      fired = false;
    },
    poll(nowMs) {
      const t = nowMs ?? now();
      if (t - lastProgressAt < deps.stallAfterMs) {
        return { stalled: false };
      }
      if (!fired) {
        fired = true;
        deps.onStalled?.();
      }
      return { stalled: true };
    },
    reset() {
      fired = false;
      lastProgressAt = now();
    },
  };
}
