import { describe, expect, mock, test } from "bun:test";

import {
  createEntitlementPolicy,
  HOBBY_PLAN,
  MemoryMeterStore,
  type PlanDocument,
} from "@/lib/entitlements";
import { applyStandingPolicyOverlay } from "@/lib/mandates/standing-policy";
import { createEscalationPort } from "@/lib/session/control/escalation-port";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { needsPermission } from "./permission";

const { createMockCapabilityInvoker } = await import("./native-invoke");
const { runCapability } = await import("./runner");

/**
 * Authorize hierarchy (keep separate planes, verify order of effect):
 * 1. entitlements
 * 2. standing policy (via PermissionPolicy overlay)
 * 3. permission-policy (settings mode)
 * 4. escalation-port
 */
describe("authorize hierarchy (thermo)", () => {
  test("entitlements deny before standing/permission/escalation run", async () => {
    const plan: PlanDocument = {
      ...HOBBY_PLAN,
      computerUseAllowed: false,
    };
    const policy = createEntitlementPolicy({
      getSubjectId: async () => "anonymous",
      getPlan: async () => plan,
      meters: new MemoryMeterStore(),
    });
    const escalate = mock(async () => "allow" as const);
    const payloads: RuntimeEventPayload[] = [];

    const result = await runCapability(
      "mouse_click",
      { button: "left", x: 1, y: 2 },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "t1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful", uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        entitlements: policy,
        escalationPort: { escalate, resolve: () => {}, denyAll: () => {} },
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async () => ({ ok: true }),
        }),
      },
      "call-ent",
    );

    expect(result.ok).toBe(false);
    expect(escalate).not.toHaveBeenCalled();
    expect(payloads.some((p) => p.type === "entitlement.denied")).toBe(true);
    expect(payloads.some((p) => p.type === "interaction.requested")).toBe(false);
  });

  test("standing deny short-circuits before escalation", async () => {
    const escalate = mock(async () => "allow" as const);
    const payloads: RuntimeEventPayload[] = [];

    const result = await runCapability(
      "delete_path",
      { path: "tmp/x.txt" },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "t2",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        standingPolicy: { version: 1, denyCapabilities: ["delete_path"] },
        escalationPort: { escalate, resolve: () => {}, denyAll: () => {} },
        invokeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/x.txt" }),
        }),
      },
      "call-standing",
    );

    expect(result).toEqual({ ok: false, denied: true });
    expect(escalate).not.toHaveBeenCalled();
    expect(payloads.some((p) => p.type === "interaction.requested")).toBe(true);
    expect(
      payloads.some((p) => p.type === "interaction.resolved" && p.permission.decision === "denied"),
    ).toBe(true);
  });

  test("standing allow bypasses permission escalate for high-risk", async () => {
    const escalate = mock(async () => "deny" as const);
    const payloads: RuntimeEventPayload[] = [];

    const result = await runCapability(
      "delete_path",
      { path: "tmp/x.txt" },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "t3",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        standingPolicy: { version: 1, allowCapabilities: ["delete_path"] },
        escalationPort: { escalate, resolve: () => {}, denyAll: () => {} },
        invokeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/x.txt" }),
        }),
      },
      "call-standing-allow",
    );

    expect(result.ok).toBe(true);
    expect(escalate).not.toHaveBeenCalled();
    expect(payloads.some((p) => p.type === "capability.completed")).toBe(true);
  });

  test("permission-policy gates escalate; once-per-class always needs permission without standing", () => {
    expect(
      needsPermission(
        { name: "read_clipboard", risk: "medium" },
        { ...DEFAULT_SETTINGS, permissionMode: "once-per-class" },
      ),
    ).toBe(true);

    const base = applyStandingPolicyOverlay("escalate", "delete_path", {
      version: 1,
      allowCapabilities: ["delete_path"],
    });
    expect(base).toBe("allow");
  });

  test("escalation deny after permission gate blocks invoke", async () => {
    const port = createEscalationPort({ mode: "interactive" });
    const payloads: RuntimeEventPayload[] = [];
    const invoke = mock(async () => ({ path: "tmp/x.txt" }));

    const resultPromise = runCapability(
      "delete_path",
      { path: "tmp/x.txt" },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "t4",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: port,
        invokeNative: invoke,
        resolveToolPart: () => ({ messageId: "a1", partIndex: 0 }),
      },
      "call-esc",
    );

    await Promise.resolve();
    port.resolve("call-esc", "deny");
    const result = await resultPromise;

    expect(result).toEqual({ ok: false, denied: true });
    expect(invoke).not.toHaveBeenCalled();
    expect(payloads.some((p) => p.type === "interaction.resolved")).toBe(true);
  });
});
