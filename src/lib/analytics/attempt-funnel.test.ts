import { afterEach, describe, expect, test } from "bun:test";

import { createRecordingMemoryAnalyticsPort } from "@/lib/analytics/adapters/recording-memory";
import { createAttemptLifecycleAnalyticsAdapter } from "@/lib/analytics/attempt-lifecycle-adapter";
import { setAnalyticsPortForTests } from "@/lib/analytics/client";
import { MemoryAttemptEventStore } from "@/lib/attempts";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { createAttemptHost } from "@/lib/session/attempt-host";
import { createDemoPayloads, createTestDemoProducer } from "@/lib/session/fixtures/demo-payloads";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

async function waitUntilCompleted(host: ReturnType<typeof createAttemptHost>): Promise<void> {
  await new Promise<void>((resolve) => {
    const unsub = host.engine.subscribe(() => {
      if (host.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });
    if (host.engine.getProjection().status === "completed") {
      unsub();
      resolve();
    }
  });
  // settled notify runs from run.finally — yield so it lands.
  await Promise.resolve();
  await Promise.resolve();
}

describe("attempt analytics funnel", () => {
  const memory = createRecordingMemoryAnalyticsPort();

  afterEach(() => {
    memory.clear();
    setAnalyticsPortForTests(null);
  });

  test("control start → settled emits attempt_started then attempt_completed", async () => {
    setAnalyticsPortForTests(memory);
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("hi")),
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo", selectedModelId: "demo-model" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
      lifecyclePort: createAttemptLifecycleAnalyticsAdapter(),
    });

    const result = await host.control.start({ prompt: "hi" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await waitUntilCompleted(host);

    const captures = memory.entries.filter((e) => e.kind === "capture");
    expect(captures[0]).toEqual({
      kind: "capture",
      event: "attempt_started",
      properties: { attempt_id: result.attemptId, model: "demo-model" },
    });
    expect(captures[1]?.kind).toBe("capture");
    if (captures[1]?.kind !== "capture") return;
    expect(captures[1].event).toBe("attempt_completed");
    expect(captures[1].properties.attempt_id).toBe(result.attemptId);
    expect(captures[1].properties.finish_reason).toBe("stop");
    expect(typeof captures[1].properties.duration_ms).toBe("number");
    expect(captures).toHaveLength(2);
  });

  test("workspace_not_ready emits attempt_blocked only", async () => {
    setAnalyticsPortForTests(memory);
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => null,
      lifecyclePort: createAttemptLifecycleAnalyticsAdapter(),
    });

    const result = await host.control.start({ prompt: "x" });
    expect(result).toEqual({ ok: false, reason: "workspace_not_ready" });
    expect(memory.entries).toEqual([
      {
        kind: "capture",
        event: "attempt_blocked",
        properties: { reason: "workspace_not_ready" },
      },
    ]);
  });
});
