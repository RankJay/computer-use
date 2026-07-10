import { describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "./invoke";
import { createMockCapabilityInvoker } from "./tauri-invoke";

describe("invokeCapability", () => {
  test("executes low-risk capability and emits lifecycle events", async () => {
    const events: RuntimeEvent[] = [];
    const result = await invokeCapability(
      "read_file",
      { path: "src/main.tsx" },
      {
        emit: (event) => events.push(event),
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({
          read_file: async () => ({ path: "src/main.tsx", content: "hello", bytes: 5 }),
        }),
      },
      "call-1",
    );

    expect(result).toEqual({
      ok: true,
      output: { path: "src/main.tsx", content: "hello", bytes: 5 },
    });
    expect(events.map((event) => event.type)).toEqual([
      "capability.requested",
      "capability.completed",
    ]);
  });

  test("invalid input emits capability.failed", async () => {
    const events: RuntimeEvent[] = [];
    const result = await invokeCapability(
      "read_file",
      {},
      {
        emit: (event) => events.push(event),
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({}),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_input");
    expect(events[events.length - 1]?.type).toBe("capability.failed");
  });

  test("high-risk capability waits for permission approval", async () => {
    const events: RuntimeEvent[] = [];
    let resolveDecision: ((value: "approved" | "denied") => void) | undefined;

    const resultPromise = invokeCapability(
      "delete_path",
      { path: "tmp/example.txt" },
      {
        emit: (event) => events.push(event),
        taskId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/example.txt" }),
        }),
        createPermissionWaiter: () => ({
          waitForDecision: () =>
            new Promise((resolve) => {
              resolveDecision = resolve;
            }),
        }),
      },
      "call-delete",
    );

    expect(events.some((event) => event.type === "permission.requested")).toBe(true);
    resolveDecision?.("approved");

    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(events.some((event) => event.type === "permission.resolved")).toBe(true);
  });

  test("denied permission returns without executing native handler", async () => {
    let nativeCalled = false;
    const result = await invokeCapability(
      "delete_path",
      { path: "tmp/example.txt" },
      {
        emit: () => {},
        taskId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: async () => {
          nativeCalled = true;
          return {};
        },
        createPermissionWaiter: () => ({
          waitForDecision: async () => "denied",
        }),
      },
    );

    expect(result).toEqual({ ok: false, denied: true });
    expect(nativeCalled).toBe(false);
  });
});
