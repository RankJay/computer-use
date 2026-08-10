import { describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "../events";
import { resolveAttemptSettleEvent } from "./attempt-lifecycle-settle";

function completed(
  attemptId: string,
  seq: number,
  finishReason: "stop" | "budget" | "cancelled" | "error",
): RuntimeEvent {
  return {
    eventId: `${attemptId}-${seq}`,
    attemptId,
    timestamp: seq,
    schemaVersion: 2,
    type: "attempt.completed",
    finishReason,
  };
}

function failed(attemptId: string, seq: number, code: string): RuntimeEvent {
  return {
    eventId: `${attemptId}-${seq}`,
    attemptId,
    timestamp: seq,
    schemaVersion: 2,
    type: "attempt.failed",
    code,
    message: "x",
    recoverable: true,
  };
}

describe("resolveAttemptSettleEvent", () => {
  test("maps stop to completed", () => {
    const settled = resolveAttemptSettleEvent("a1", [completed("a1", 1, "stop")], 100);
    expect(settled).toEqual({
      type: "settled",
      attemptId: "a1",
      outcome: "completed",
      finish_reason: "stop",
      duration_ms: 100,
    });
  });

  test("maps budget to completed", () => {
    const settled = resolveAttemptSettleEvent("a1", [completed("a1", 1, "budget")], 50);
    expect(settled.outcome).toBe("completed");
    if (settled.outcome === "completed") {
      expect(settled.finish_reason).toBe("budget");
    }
  });

  test("maps attempt.failed to failed with code", () => {
    const settled = resolveAttemptSettleEvent("a1", [failed("a1", 1, "provider")], 10);
    expect(settled).toEqual({
      type: "settled",
      attemptId: "a1",
      outcome: "failed",
      error_code: "provider",
      duration_ms: 10,
    });
  });

  test("unsettled when no terminal event", () => {
    const settled = resolveAttemptSettleEvent("a1", [], 0);
    expect(settled).toEqual({
      type: "settled",
      attemptId: "a1",
      outcome: "failed",
      error_code: "unsettled",
      duration_ms: 0,
    });
  });

  test("uses last terminal for attemptId", () => {
    const settled = resolveAttemptSettleEvent(
      "a1",
      [failed("a1", 1, "early"), completed("a1", 2, "cancelled"), completed("other", 3, "stop")],
      9,
    );
    expect(settled.outcome).toBe("completed");
    if (settled.outcome === "completed") {
      expect(settled.finish_reason).toBe("cancelled");
    }
  });
});
