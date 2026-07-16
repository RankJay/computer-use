import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

const notifyIfUnfocusedMock = mock((_notification: { title: string; body: string }) => {});

mock.module("@/lib/native/notification", () => ({
  notify: mock(() => {}),
  notifyIfUnfocused: notifyIfUnfocusedMock,
}));

const { createMockCapabilityInvoker } = await import("./native-invoke");
const { runCapability } = await import("./runner");

describe("runCapability", () => {
  beforeEach(() => {
    notifyIfUnfocusedMock.mockClear();
  });

  test("executes low-risk capability and emits lifecycle payloads", async () => {
    const payloads: RuntimeEventPayload[] = [];
    const result = await runCapability(
      "read_file",
      { path: "src/main.tsx" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: createMockCapabilityInvoker({
          read_file: async () => ({ path: "src/main.tsx", content: "hello", bytes: 5 }),
        }),
      },
      "call-1",
    );

    expect(result).toEqual({
      ok: true,
      output: { path: "src/main.tsx", content: "hello", bytes: 5 },
    });
    expect(payloads.map((p) => p.type)).toEqual(["capability.requested", "capability.completed"]);
  });

  test("invalid input emits capability.failed", async () => {
    const payloads: RuntimeEventPayload[] = [];
    const result = await runCapability(
      "read_file",
      {},
      {
        append: (payload) => payloads.push(payload),
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v3",
        createPermissionWaiter: () => ({
          waitForDecision: async () => "approved" as const,
        }),
        invokeNative: createMockCapabilityInvoker({}),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("error" in result && result.error.code).toBe("invalid_input");
    expect(payloads[payloads.length - 1]?.type).toBe("capability.failed");
  });

  test("high-risk capability waits for permission and emits approval parts", async () => {
    const payloads: RuntimeEventPayload[] = [];
    let resolveDecision: ((value: "approved" | "denied") => void) | undefined;

    const resultPromise = runCapability(
      "delete_path",
      { path: "tmp/example.txt" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        invokeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/example.txt" }),
        }),
        createPermissionWaiter: () => ({
          waitForDecision: () =>
            new Promise((resolve) => {
              resolveDecision = resolve;
            }),
        }),
        resolveToolPart: () => ({ messageId: "assistant-task-1", partIndex: 0 }),
      },
      "call-delete",
    );

    await Promise.resolve();
    expect(payloads.some((p) => p.type === "permission.requested")).toBe(true);
    expect(
      payloads.some(
        (p) =>
          p.type === "assistant.part_updated" &&
          p.part.type === "dynamic-tool" &&
          p.part.state === "approval-requested",
      ),
    ).toBe(true);
    expect(notifyIfUnfocusedMock).toHaveBeenCalledTimes(1);
    expect(notifyIfUnfocusedMock).toHaveBeenCalledWith({
      title: "Approval needed",
      body: "Removing a path is waiting. Hop back in to approve or reject.",
    });

    resolveDecision?.("approved");
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(payloads.some((p) => p.type === "permission.resolved")).toBe(true);
    expect(
      payloads.some(
        (p) =>
          p.type === "assistant.part_updated" &&
          p.part.type === "dynamic-tool" &&
          p.part.state === "approval-responded",
      ),
    ).toBe(true);
  });

  test("denied permission returns without executing native handler", async () => {
    let nativeCalled = false;
    const payloads: RuntimeEventPayload[] = [];
    const result = await runCapability(
      "delete_path",
      { path: "tmp/example.txt" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        invokeNative: async () => {
          nativeCalled = true;
          return {};
        },
        createPermissionWaiter: () => ({
          waitForDecision: async () => "denied" as const,
        }),
        resolveToolPart: () => ({ messageId: "assistant-task-1", partIndex: 0 }),
      },
      "call-deny",
    );

    expect(result).toEqual({ ok: false, denied: true });
    expect(nativeCalled).toBe(false);
    expect(
      payloads.some(
        (p) =>
          p.type === "assistant.part_updated" &&
          p.part.type === "dynamic-tool" &&
          p.part.state === "output-denied",
      ),
    ).toBe(true);
  });

  test("re-resolves tool part after waiter when first resolve was null", async () => {
    const payloads: RuntimeEventPayload[] = [];
    let resolveDecision: ((value: "approved" | "denied") => void) | undefined;
    let resolveCalls = 0;

    const resultPromise = runCapability(
      "delete_path",
      { path: "tmp/late.txt" },
      {
        append: (payload) => payloads.push(payload),
        taskId: "task-1",
        settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
        workspaceRoot: "D:/Projects/actuate-v3",
        invokeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/late.txt" }),
        }),
        createPermissionWaiter: () => ({
          waitForDecision: () =>
            new Promise((resolve) => {
              resolveDecision = resolve;
            }),
        }),
        resolveToolPart: () => {
          resolveCalls += 1;
          // First emit (approval-requested) misses; post-decision emit finds the part.
          if (resolveCalls === 1) return null;
          return { messageId: "assistant-task-1", partIndex: 0 };
        },
      },
      "call-late",
    );

    await Promise.resolve();
    expect(
      payloads.some(
        (p) =>
          p.type === "assistant.part_updated" &&
          p.part.type === "dynamic-tool" &&
          p.part.state === "approval-requested",
      ),
    ).toBe(false);

    resolveDecision?.("approved");
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(
      payloads.some(
        (p) =>
          p.type === "assistant.part_updated" &&
          p.part.type === "dynamic-tool" &&
          p.part.state === "approval-responded",
      ),
    ).toBe(true);
  });

  test("parallel callIds each await their own waiter", async () => {
    const resolvers = new Map<string, (value: "approved" | "denied") => void>();

    const makeDeps = () => ({
      append: () => {},
      taskId: "task-1",
      settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" as const },
      workspaceRoot: "D:/Projects/actuate-v3",
      invokeNative: createMockCapabilityInvoker({
        delete_path: async (input) => input,
      }),
      createPermissionWaiter: (callId: string) => ({
        waitForDecision: () =>
          new Promise<"approved" | "denied">((resolve) => {
            resolvers.set(callId, resolve);
          }),
      }),
    });

    const a = runCapability("delete_path", { path: "a.txt" }, makeDeps(), "call-a");
    const b = runCapability("delete_path", { path: "b.txt" }, makeDeps(), "call-b");

    await Promise.resolve();
    expect(resolvers.has("call-a")).toBe(true);
    expect(resolvers.has("call-b")).toBe(true);

    resolvers.get("call-b")?.("approved");
    const resultB = await b;
    expect(resultB.ok).toBe(true);

    resolvers.get("call-a")?.("denied");
    const resultA = await a;
    expect(resultA).toEqual({ ok: false, denied: true });
  });
});
