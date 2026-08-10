import { afterEach, describe, expect, test } from "bun:test";

import { createRecordingMemoryAnalyticsPort } from "@/lib/analytics/adapters/recording-memory";
import { createAttemptLifecycleAnalyticsAdapter } from "@/lib/analytics/attempt-lifecycle-adapter";
import { setAnalyticsPortForTests } from "@/lib/analytics/client";

describe("createAttemptLifecycleAnalyticsAdapter", () => {
  const memory = createRecordingMemoryAnalyticsPort();

  afterEach(() => {
    memory.clear();
    setAnalyticsPortForTests(null);
  });

  test("maps started / blocked / settled", () => {
    setAnalyticsPortForTests(memory);
    const port = createAttemptLifecycleAnalyticsAdapter();

    port.notify({ type: "started", attemptId: "a1", model: "m1" });
    port.notify({ type: "blocked", reason: "concurrency_reject" });
    port.notify({
      type: "settled",
      attemptId: "a1",
      outcome: "completed",
      finish_reason: "stop",
      duration_ms: 12,
    });
    port.notify({
      type: "settled",
      attemptId: "a2",
      outcome: "failed",
      error_code: "unsettled",
      duration_ms: 0,
    });

    expect(memory.entries).toEqual([
      {
        kind: "capture",
        event: "attempt_started",
        properties: { attempt_id: "a1", model: "m1" },
      },
      {
        kind: "capture",
        event: "attempt_blocked",
        properties: { reason: "concurrency_reject" },
      },
      {
        kind: "capture",
        event: "attempt_completed",
        properties: {
          attempt_id: "a1",
          finish_reason: "stop",
          duration_ms: 12,
        },
      },
      {
        kind: "capture",
        event: "attempt_failed",
        properties: {
          attempt_id: "a2",
          error_code: "unsettled",
          duration_ms: 0,
        },
      },
    ]);
  });
});
