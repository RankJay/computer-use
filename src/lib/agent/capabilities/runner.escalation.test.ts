import { describe, expect, mock, test } from "bun:test";

import { createEscalationPort } from "@/lib/session/control/escalation-port";
import { createOsLease } from "@/lib/session/control/os-lease";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

mock.module("@/lib/native/notification", () => ({
  notify: mock(() => {}),
  notifyIfUnfocused: mock(() => {}),
}));

const { createMockCapabilityInvoker } = await import("./native-invoke");
const { runCapability } = await import("./runner");

describe("runCapability EscalationPort park", () => {
  test("park mode releases lease before wait; timeout denies call", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-1", "desktop");
    const payloads: RuntimeEventPayload[] = [];

    const port = createEscalationPort({
      mode: "park",
      timeoutMs: 25,
      osLease: lease,
      notifyIfUnfocused: () => {},
    });

    const result = await runCapability(
      "delete_path",
      { path: "tmp/x.txt" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "attempt-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: port,
        invokeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/x.txt" }),
        }),
        osLease: lease,
      },
      "call-park",
    );

    expect(result).toEqual({ ok: false, denied: true });
    expect(lease.holder()).toBeNull();
    expect(payloads.some((p) => p.type === "permission.requested")).toBe(true);
    expect(payloads.some((p) => p.type === "permission.resolved" && p.decision === "denied")).toBe(
      true,
    );
  });
});
