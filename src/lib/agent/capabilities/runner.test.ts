import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  createAutoEscalationPort,
  createEscalationPort,
} from "@/lib/session/control/escalation-port";
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
        escalationPort: createAutoEscalationPort("allow"),
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
        escalationPort: createAutoEscalationPort("allow"),
        invokeNative: createMockCapabilityInvoker({}),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("error" in result && result.error.code).toBe("invalid_input");
    expect(payloads[payloads.length - 1]?.type).toBe("capability.failed");
  });

  test("high-risk capability waits for EscalationPort and emits approval parts", async () => {
    const payloads: RuntimeEventPayload[] = [];
    const port = createEscalationPort({ mode: "interactive" });

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
        escalationPort: port,
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

    port.resolve("call-delete", "allow");
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

  test("denied escalation returns without executing native handler", async () => {
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
        escalationPort: createAutoEscalationPort("deny"),
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

  test("re-resolves tool part after escalate when first resolve was null", async () => {
    const payloads: RuntimeEventPayload[] = [];
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });
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
        escalationPort: port,
        resolveToolPart: () => {
          resolveCalls += 1;
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

    port.resolve("call-late", "allow");
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

  test("parallel callIds each await their own escalate", async () => {
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });

    const makeDeps = () => ({
      append: () => {},
      taskId: "task-1",
      settings: { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" as const },
      workspaceRoot: "D:/Projects/actuate-v3",
      invokeNative: createMockCapabilityInvoker({
        delete_path: async (input) => input,
      }),
      escalationPort: port,
    });

    const a = runCapability("delete_path", { path: "a.txt" }, makeDeps(), "call-a");
    const b = runCapability("delete_path", { path: "b.txt" }, makeDeps(), "call-b");

    await Promise.resolve();
    port.resolve("call-b", "allow");
    const resultB = await b;
    expect(resultB.ok).toBe(true);

    port.resolve("call-a", "deny");
    const resultA = await a;
    expect(resultA).toEqual({ ok: false, denied: true });
  });
});
