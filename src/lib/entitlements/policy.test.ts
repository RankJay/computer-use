import { describe, expect, test } from "bun:test";

import { capabilityClassOf, modelTierOf } from "./classify";
import { MemoryMeterStore } from "./meters/adapters/memory-store";
import { HOBBY_PLAN, METER_KEY_ATTEMPTS, METER_KEY_COMPUTER_USE } from "./plans";
import { createEntitlementPolicy } from "./policy";
import type { PlanDocument } from "./types";

const TIGHT_HOBBY: PlanDocument = {
  ...HOBBY_PLAN,
  allowedModelTiers: ["standard"],
  attemptsPerDay: 2,
  computerUseActionsPerDay: 1,
  computerUseAllowed: true,
};

describe("classify", () => {
  test("model tiers", () => {
    expect(modelTierOf("anthropic/claude-haiku-4-5")).toBe("standard");
    expect(modelTierOf("anthropic/claude-opus-4-5")).toBe("premium");
  });

  test("computer_use class", () => {
    expect(capabilityClassOf("mouse_click")).toBe("computer_use");
    expect(capabilityClassOf("accessibility_snapshot")).toBe("computer_use");
    expect(capabilityClassOf("read_file")).toBe("other");
    expect(capabilityClassOf("run_shell")).toBe("other");
  });
});

describe("EntitlementPolicy", () => {
  test("hobby allows all catalog models and meters attempts without ceiling", async () => {
    const meters = new MemoryMeterStore();
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      meters,
      now: () => new Date("2026-07-23T12:00:00Z"),
    });

    const model = await policy.authorize({
      kind: "model",
      modelId: "anthropic/claude-opus-4-5",
    });
    expect(model).toEqual({ outcome: "allow" });

    const start = await policy.authorize({ kind: "attempt_start" });
    expect(start.outcome).toBe("allow_and_meter");
    if (start.outcome !== "allow_and_meter") return;
    expect(start.meterKey).toBe(METER_KEY_ATTEMPTS);
    expect(start.newValue).toBe(1);

    expect(await meters.get("anonymous", METER_KEY_ATTEMPTS, "2026-07-23")).toBe(1);
  });

  test("tight plan require_upgrade on attempt ceiling", async () => {
    const meters = new MemoryMeterStore();
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => TIGHT_HOBBY,
      meters,
      now: () => new Date("2026-07-23T12:00:00Z"),
    });

    expect((await policy.authorize({ kind: "attempt_start" })).outcome).toBe("allow_and_meter");
    expect((await policy.authorize({ kind: "attempt_start" })).outcome).toBe("allow_and_meter");
    const blocked = await policy.authorize({ kind: "attempt_start" });
    expect(blocked).toEqual({
      outcome: "require_upgrade",
      reason: "Daily attempt limit reached on the hobby plan.",
      feature: "attempts",
    });
  });

  test("tight plan require_upgrade on premium model", async () => {
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => TIGHT_HOBBY,
      meters: new MemoryMeterStore(),
    });

    const decision = await policy.authorize({
      kind: "model",
      modelId: "anthropic/claude-opus-4-5",
    });
    expect(decision.outcome).toBe("require_upgrade");
  });

  test("computer_use meters; other capabilities allow without meter", async () => {
    const meters = new MemoryMeterStore();
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "user:1",
      getPlan: async () => TIGHT_HOBBY,
      meters,
      now: () => new Date("2026-07-23T12:00:00Z"),
    });

    const other = await policy.authorize({
      kind: "capability",
      capability: "read_file",
      capabilityClass: "other",
    });
    expect(other).toEqual({ outcome: "allow" });

    const cu = await policy.authorize({
      kind: "capability",
      capability: "mouse_click",
      capabilityClass: "computer_use",
    });
    expect(cu.outcome).toBe("allow_and_meter");
    if (cu.outcome !== "allow_and_meter") return;
    expect(cu.meterKey).toBe(METER_KEY_COMPUTER_USE);

    const blocked = await policy.authorize({
      kind: "capability",
      capability: "mouse_move",
      capabilityClass: "computer_use",
    });
    expect(blocked.outcome).toBe("require_upgrade");
  });

  test("policy module has no permission-waiter coupling (type-level seam)", () => {
    // EntitlementPolicy authorize signature is commercial-only.
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      meters: new MemoryMeterStore(),
    });
    expect(typeof policy.authorize).toBe("function");
  });

  test("commit:false checks ceiling without incrementing", async () => {
    const meters = new MemoryMeterStore();
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => TIGHT_HOBBY,
      meters,
      now: () => new Date("2026-07-23T12:00:00Z"),
    });

    const preview = await policy.authorize(
      { kind: "capability", capability: "mouse_click", capabilityClass: "computer_use" },
      { commit: false },
    );
    expect(preview.outcome).toBe("allow_and_meter");
    expect(await meters.get("user:1", METER_KEY_COMPUTER_USE, "2026-07-23")).toBe(0);
    expect(await meters.get("anonymous", METER_KEY_COMPUTER_USE, "2026-07-23")).toBe(0);

    const committed = await policy.authorize(
      { kind: "capability", capability: "mouse_click", capabilityClass: "computer_use" },
      { commit: true },
    );
    expect(committed.outcome).toBe("allow_and_meter");
    expect(await meters.get("anonymous", METER_KEY_COMPUTER_USE, "2026-07-23")).toBe(1);
  });
});
