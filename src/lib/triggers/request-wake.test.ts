import { describe, expect, mock, test } from "bun:test";

import { MemoryMandatesPersistence } from "@/lib/mandates";
import type { AttemptStartResult } from "@/lib/session/control/attempt-control";
import { createAttemptRegistry } from "@/lib/session/control/attempt-registry";

import { requestTriggerWake } from "./request-wake";

describe("requestTriggerWake", () => {
  test("suppresses and does not call AttemptControl.start when Mandate running", async () => {
    const mandates = new MemoryMandatesPersistence();
    const mandate = await mandates.create({ status: "running" });
    const registry = createAttemptRegistry();
    registry.setLive({ mandateId: mandate.id, attemptId: "a1" });

    const start = mock(
      async (): Promise<AttemptStartResult> => ({
        ok: true,
        mandateId: mandate.id,
        attemptId: "should-not-run",
      }),
    );

    const result = await requestTriggerWake({
      mandates,
      getLive: () => registry.getLive(),
      start,
      mandateId: mandate.id,
      prompt: "wake",
      triggerId: "fs-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.suppressed.action).toBe("suppress");
    expect(result.fact.type).toBe("trigger.suppressed");
    expect(start).not.toHaveBeenCalled();
  });

  test("starts via AttemptControl when armed and idle", async () => {
    const mandates = new MemoryMandatesPersistence();
    const mandate = await mandates.create({ status: "armed" });
    const registry = createAttemptRegistry();

    const start = mock(
      async (): Promise<AttemptStartResult> => ({
        ok: true,
        mandateId: mandate.id,
        attemptId: "a-new",
      }),
    );

    const result = await requestTriggerWake({
      mandates,
      getLive: () => registry.getLive(),
      start,
      mandateId: mandate.id,
      prompt: "do the chore",
    });

    expect(result).toEqual({
      ok: true,
      started: { ok: true, mandateId: mandate.id, attemptId: "a-new" },
    });
    expect(start).toHaveBeenCalledWith({ prompt: "do the chore", mandateId: mandate.id });
  });
});
