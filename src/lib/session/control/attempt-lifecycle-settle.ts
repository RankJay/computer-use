import type { RuntimeEvent } from "../events";
import type { AttemptLifecycleEvent } from "./attempt-lifecycle-port";

type TerminalEvent = Extract<
  RuntimeEvent,
  { type: "attempt.completed" } | { type: "attempt.failed" }
>;

/**
 * Map the Attempt event log to a single settled lifecycle event.
 * Prefers the chronologically last completed/failed for the attemptId.
 */
export function resolveAttemptSettleEvent(
  attemptId: string,
  eventLog: readonly RuntimeEvent[],
  duration_ms: number,
): Extract<AttemptLifecycleEvent, { type: "settled" }> {
  let last: TerminalEvent | undefined;
  for (const event of eventLog) {
    if (event.attemptId !== attemptId) {
      continue;
    }
    if (event.type === "attempt.completed" || event.type === "attempt.failed") {
      last = event;
    }
  }

  if (!last) {
    return {
      type: "settled",
      attemptId,
      outcome: "failed",
      error_code: "unsettled",
      duration_ms,
    };
  }

  if (last.type === "attempt.failed") {
    return {
      type: "settled",
      attemptId,
      outcome: "failed",
      error_code: last.code,
      duration_ms,
    };
  }

  switch (last.finishReason) {
    case "stop":
    case "cancelled":
    case "budget":
      return {
        type: "settled",
        attemptId,
        outcome: "completed",
        finish_reason: last.finishReason,
        duration_ms,
      };
    case "error":
      return {
        type: "settled",
        attemptId,
        outcome: "failed",
        error_code: "error",
        duration_ms,
      };
    default: {
      const _exhaustive: never = last.finishReason;
      return _exhaustive;
    }
  }
}
