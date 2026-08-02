import { beforeEach, describe, expect, mock, test } from "bun:test";

import {
  createAutoEscalationPort,
  createEscalationPort,
} from "@/lib/session/control/escalation-port";
import { RUNTIME_EVENT_SCHEMA_VERSION, type RuntimeEventPayload } from "@/lib/session/events";
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
        attemptId: "task-1",
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
        attemptId: "task-1",
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
        attemptId: "task-1",
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
    expect(payloads.some((p) => p.type === "interaction.requested")).toBe(true);
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
    expect(payloads.some((p) => p.type === "interaction.resolved")).toBe(true);
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
        attemptId: "task-1",
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
        attemptId: "task-1",
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

  test("mouse_click_image remaps via last screenshot then invokes mouse_click", async () => {
    const payloads: RuntimeEventPayload[] = [];
    let clicked: unknown;
    const log = [
      {
        eventId: "evt-shot",
        attemptId: "task-1",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        type: "capability.completed" as const,
        callId: "shot-1",
        capability: "screenshot",
        output: {
          width: 100,
          height: 50,
          mimeType: "image/png",
          base64: "x",
          bounds: { x: 10, y: 20, width: 200, height: 100 },
          scaleX: 2,
          scaleY: 2,
        },
      },
    ];

    const result = await runCapability(
      "mouse_click_image",
      { imageX: 5, imageY: 10 },
      {
        append: (payload) => payloads.push(payload),
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => log,
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async (input) => {
            clicked = input;
            return { ok: true };
          },
        }),
      },
      "click-img-1",
    );

    expect(result).toEqual({
      ok: true,
      output: {
        ok: true,
        screenX: 20,
        screenY: 40,
        screenshotCallId: "shot-1",
      },
    });
    expect(clicked).toEqual({ button: "left", count: 1, x: 20, y: 40 });
    expect(payloads.map((p) => p.type)).toEqual(["capability.requested", "capability.completed"]);
  });

  test("mouse_click_image prefers latest screenshot_zoom geometry", async () => {
    let clicked: unknown;
    const log = [
      {
        eventId: "evt-shot",
        attemptId: "task-1",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        type: "capability.completed" as const,
        callId: "shot-1",
        capability: "screenshot",
        output: {
          width: 100,
          height: 50,
          mimeType: "image/png",
          base64: "x",
          bounds: { x: 10, y: 20, width: 200, height: 100 },
          scaleX: 2,
          scaleY: 2,
        },
      },
      {
        eventId: "evt-crop",
        attemptId: "task-1",
        timestamp: 2,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        type: "capability.completed" as const,
        callId: "crop-1",
        capability: "screenshot_zoom",
        output: {
          width: 40,
          height: 20,
          mimeType: "image/png",
          base64: "zoom",
          bounds: { x: 20, y: 40, width: 80, height: 40 },
          scaleX: 2,
          scaleY: 2,
        },
      },
    ];

    const result = await runCapability(
      "mouse_click_image",
      { imageX: 5, imageY: 10 },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => log,
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async (input) => {
            clicked = input;
            return { ok: true };
          },
        }),
      },
      "click-region-1",
    );

    expect(result).toEqual({
      ok: true,
      output: {
        ok: true,
        screenX: 30,
        screenY: 60,
        screenshotCallId: "crop-1",
      },
    });
    expect(clicked).toEqual({ button: "left", count: 1, x: 30, y: 60 });
  });

  test("mouse_click_image rejects out-of-bounds image coords", async () => {
    const result = await runCapability(
      "mouse_click_image",
      { imageX: 100, imageY: 0 },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => [
          {
            eventId: "evt-shot",
            attemptId: "task-1",
            timestamp: 1,
            schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
            type: "capability.completed" as const,
            callId: "shot-1",
            capability: "screenshot",
            output: {
              width: 100,
              height: 50,
              mimeType: "image/png",
              base64: "x",
              bounds: { x: 0, y: 0, width: 200, height: 100 },
              scaleX: 2,
              scaleY: 2,
            },
          },
        ],
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async () => ({ ok: true }),
        }),
      },
      "click-oob",
    );

    expect(result.ok).toBe(false);
    if (result.ok || !("error" in result)) return;
    expect(result.error.code).toBe("invalid_input");
    expect(result.error.message).toContain("outside screenshot");
  });

  test("screenshot_zoom remaps image rect then invokes native screenshot_region", async () => {
    let regionArgs: unknown;
    const log = [
      {
        eventId: "evt-shot",
        attemptId: "task-1",
        timestamp: 1,
        schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
        type: "capability.completed" as const,
        callId: "shot-1",
        capability: "screenshot",
        output: {
          width: 100,
          height: 50,
          mimeType: "image/png",
          base64: "x",
          bounds: { x: 10, y: 20, width: 200, height: 100 },
          scaleX: 2,
          scaleY: 2,
        },
      },
    ];

    const result = await runCapability(
      "screenshot_zoom",
      { imageX: 5, imageY: 10, imageWidth: 10, imageHeight: 5 },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => log,
        invokeNative: createMockCapabilityInvoker({
          screenshot_region: async (input) => {
            regionArgs = input;
            return {
              width: 40,
              height: 20,
              mimeType: "image/png",
              base64: "zoom",
              bounds: { x: 20, y: 40, width: 19, height: 9 },
              scaleX: 0.475,
              scaleY: 0.45,
            };
          },
        }),
      },
      "region-1",
    );

    expect(result.ok).toBe(true);
    expect(regionArgs).toEqual({ x: 20, y: 40, width: 19, height: 9 });
  });

  test("screenshot_zoom rejects out-of-bounds image rect", async () => {
    const result = await runCapability(
      "screenshot_zoom",
      { imageX: 90, imageY: 0, imageWidth: 20, imageHeight: 10 },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => [
          {
            eventId: "evt-shot",
            attemptId: "task-1",
            timestamp: 1,
            schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
            type: "capability.completed" as const,
            callId: "shot-1",
            capability: "screenshot",
            output: {
              width: 100,
              height: 50,
              mimeType: "image/png",
              base64: "x",
              bounds: { x: 0, y: 0, width: 200, height: 100 },
              scaleX: 2,
              scaleY: 2,
            },
          },
        ],
        invokeNative: createMockCapabilityInvoker({
          screenshot_region: async () => ({ ok: true }),
        }),
      },
      "region-oob",
    );

    expect(result.ok).toBe(false);
    if (result.ok || !("error" in result)) return;
    expect(result.error.code).toBe("invalid_input");
  });

  test("mouse_click_image fails when no screenshot in event log", async () => {
    const result = await runCapability(
      "mouse_click_image",
      { imageX: 1, imageY: 1 },
      {
        append: () => {},
        attemptId: "task-1",
        settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
        workspaceRoot: "D:/Projects/actuate-v3",
        escalationPort: createAutoEscalationPort("allow"),
        getEventLog: () => [],
        invokeNative: createMockCapabilityInvoker({
          mouse_click: async () => ({ ok: true }),
        }),
      },
      "click-no-shot",
    );

    expect(result.ok).toBe(false);
    if (result.ok || !("error" in result)) return;
    expect(result.error.code).toBe("invalid_input");
    expect(result.error.message).toContain("screenshot");
  });

  test("parallel callIds each await their own escalate", async () => {
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });

    const makeDeps = () => ({
      append: () => {},
      attemptId: "task-1",
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
