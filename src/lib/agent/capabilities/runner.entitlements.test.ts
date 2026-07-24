import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  createEntitlementPolicy,
  MemoryMeterStore,
  HOBBY_PLAN,
  METER_KEY_COMPUTER_USE,
  type PlanDocument,
} from "@/lib/entitlements";
import { createAutoEscalationPort } from "@/lib/session/control/escalation-port";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

const notifyIfUnfocusedMock = mock((_notification: { title: string; body: string }) => {});

mock.module("@/lib/native/notification", () => ({
  notify: mock(() => {}),
  notifyIfUnfocused: notifyIfUnfocusedMock,
}));

const { createMockCapabilityInvoker } = await import("./native-invoke");
const { runCapability } = await import("./runner");

const NO_COMPUTER_USE: PlanDocument = {
  ...HOBBY_PLAN,
  computerUseAllowed: false,
};

describe("runCapability entitlements", () => {
  beforeEach(() => {
    notifyIfUnfocusedMock.mockClear();
  });

  test("computer_use require_upgrade fails call without native invoke or escalation", async () => {
    const payloads: RuntimeEventPayload[] = [];
    let escalated = false;
    let invoked = false;

    const entitlements = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => NO_COMPUTER_USE,
      meters: new MemoryMeterStore(),
    });

    const result = await runCapability(
      "mouse_click",
      { x: 1, y: 2, button: "left" },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: {
          escalate: async () => {
            escalated = true;
            return "allow";
          },
          resolve: () => {},
          denyAll: () => {},
        },
        invokeNative: async () => {
          invoked = true;
          return {};
        },
        entitlements,
      },
      "call-cu",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "entitlement_upgrade",
        message: "Computer use is not included on this plan.",
      },
    });
    expect(escalated).toBe(false);
    expect(invoked).toBe(false);
    expect(payloads.map((p) => p.type)).toEqual([
      "capability.requested",
      "entitlement.denied",
      "capability.failed",
    ]);
  });

  test("other capabilities skip computer_use meter", async () => {
    const entitlements = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => ({ ...HOBBY_PLAN, computerUseActionsPerDay: 0 }),
      meters: new MemoryMeterStore(),
    });

    const result = await runCapability(
      "read_file",
      { path: "src/main.tsx" },
      {
        append: () => {},
        attemptId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        invokeNative: createMockCapabilityInvoker({
          read_file: async () => ({ path: "src/main.tsx", content: "hi", bytes: 2 }),
        }),
        entitlements,
      },
      "call-read",
    );

    expect(result).toEqual({
      ok: true,
      output: { path: "src/main.tsx", content: "hi", bytes: 2 },
    });
  });

  test("permission deny does not consume computer_use meter", async () => {
    const meters = new MemoryMeterStore();
    const entitlements = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => ({ ...HOBBY_PLAN, computerUseActionsPerDay: 5 }),
      meters,
      now: () => new Date("2026-07-23T00:00:00Z"),
    });

    const result = await runCapability(
      "mouse_click",
      { x: 1, y: 2, button: "left" },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("deny"),
        invokeNative: async () => {
          throw new Error("should not invoke");
        },
        entitlements,
      },
      "call-deny",
    );

    expect(result).toEqual({ ok: false, denied: true });
    expect(await meters.get("anonymous", METER_KEY_COMPUTER_USE, "2026-07-23")).toBe(0);
  });
});
