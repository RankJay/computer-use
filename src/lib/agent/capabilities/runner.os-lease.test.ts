import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createOsLease } from "@/lib/session/control/os-lease";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

const notifyIfUnfocusedMock = mock((_notification: { title: string; body: string }) => {});

mock.module("@/lib/native/notification", () => ({
  notify: mock(() => {}),
  notifyIfUnfocused: notifyIfUnfocusedMock,
}));

const { createMockCapabilityInvoker } = await import("./native-invoke");
const { runCapability } = await import("./runner");

describe("runCapability OS lease", () => {
  beforeEach(() => {
    notifyIfUnfocusedMock.mockClear();
  });

  test("UI automation acquires lease; non-UI does not need it", async () => {
    const lease = createOsLease();
    const payloads: RuntimeEventPayload[] = [];

    const ui = await runCapability(
      "mouse_click",
      { x: 1, y: 2, button: "left" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "attempt-a",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "risky" },
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async () => ({ ok: true }),
        }),
        osLease: lease,
      },
      "call-mouse",
    );

    expect(ui.ok).toBe(true);
    expect(lease.holder()?.attemptId).toBe("attempt-a");

    const fs = await runCapability(
      "read_file",
      { path: "src/main.tsx" },
      {
        append: () => {},
        taskId: "attempt-b",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: createMockCapabilityInvoker({
          read_file: async () => ({ path: "src/main.tsx", content: "x", bytes: 1 }),
        }),
        osLease: lease,
      },
      "call-read",
    );

    expect(fs.ok).toBe(true);
    expect(lease.holder()?.attemptId).toBe("attempt-a");
  });

  test("second Attempt cannot take UI automation while first holds lease", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-a", "desktop");

    let invoked = false;
    const result = await runCapability(
      "mouse_click",
      { x: 1, y: 2, button: "left" },
      {
        append: () => {},
        taskId: "attempt-b",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "risky" },
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: async () => {
          invoked = true;
          return {};
        },
        osLease: lease,
      },
      "call-blocked",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "os_lease_held",
        message: "Desktop OS lease held by another Attempt (attempt-a).",
      },
    });
    expect(invoked).toBe(false);
  });

  test("cancel release lets another Attempt acquire", async () => {
    const lease = createOsLease();
    lease.acquire("attempt-a", "desktop");
    lease.release("attempt-a");

    const result = await runCapability(
      "window_focus",
      { windowId: 1 },
      {
        append: () => {},
        taskId: "attempt-b",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "risky" },
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: createMockCapabilityInvoker({
          window_focus: async () => ({ ok: true }),
        }),
        osLease: lease,
      },
      "call-focus",
    );

    expect(result.ok).toBe(true);
    expect(lease.holder()?.attemptId).toBe("attempt-b");
  });
});
