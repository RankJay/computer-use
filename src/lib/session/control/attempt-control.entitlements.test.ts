import { describe, expect, test } from "bun:test";

import {
  createEntitlementPolicy,
  MemoryMeterStore,
  type PlanDocument,
  HOBBY_PLAN,
  METER_KEY_ATTEMPTS,
} from "@/lib/entitlements";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "../attempt-host";
import { createDemoPayloads, createTestDemoProducer } from "../fixtures/demo-payloads";

const ONE_ATTEMPT: PlanDocument = {
  ...HOBBY_PLAN,
  attemptsPerDay: 1,
};

describe("AttemptControl entitlements", () => {
  test("start blocked by attempt meter ceiling without running producer", async () => {
    let producerCalls = 0;
    const meters = new MemoryMeterStore();
    const entitlements = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => ONE_ATTEMPT,
      meters,
      now: () => new Date("2026-07-23T00:00:00Z"),
    });

    const host = createAttemptHost({
      produceRun: async (ctx) => {
        producerCalls += 1;
        return createTestDemoProducer(createDemoPayloads("hi"))(ctx);
      },
      mandates: new MemoryMandatesPersistence(),
      entitlements,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const first = await host.control.start({ prompt: "one" });
    expect(first.ok).toBe(true);
    expect(await meters.get("anonymous", METER_KEY_ATTEMPTS, "2026-07-23")).toBe(1);

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

    const second = await host.control.start({ prompt: "two" });
    expect(second).toMatchObject({
      ok: false,
      reason: "require_upgrade",
      feature: "attempts",
    });
    expect(producerCalls).toBe(1);
  });

  test("meters survive across host projection remount (same MeterStore)", async () => {
    const meters = new MemoryMeterStore();
    const now = () => new Date("2026-07-23T00:00:00Z");
    const makeHost = () =>
      createAttemptHost({
        produceRun: createTestDemoProducer(createDemoPayloads("x")),
        mandates: new MemoryMandatesPersistence(),
        entitlements: createEntitlementPolicy({
          getSubjectId: async () => "anonymous",
          getPlan: async () => ONE_ATTEMPT,
          meters,
          now,
        }),
        loadRunContext: async () => ({
          settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
          secrets: DEFAULT_SECRETS,
          persistApproval: async () => {},
        }),
      });

    const a = makeHost();
    expect((await a.control.start({ prompt: "a" })).ok).toBe(true);

    await new Promise<void>((resolve) => {
      const unsub = a.engine.subscribe(() => {
        if (a.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
      if (a.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });

    const b = makeHost();
    const blocked = await b.control.start({ prompt: "b" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe("require_upgrade");
    }
  });
});
