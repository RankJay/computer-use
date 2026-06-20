import { describe, expect, test } from "bun:test";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { createUiAutomationRunState } from "@/agent/tools/uiAutomationState";
import {
  createKeyTapTool,
  createPointerClickTool,
  createPointerMoveTool,
  createTypeTextTool,
  createUiFocusTypeTool,
} from "@/agent/tools/uiAutomationTools";
import type { AgentEvent } from "@/agent/types";

function createNativeSpy(): { readonly native: AgentNativeBridge; readonly calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    native: {
      capturePrimaryDisplayPngBase64: async () => ({
        pngBase64: "",
        imageWidth: 1,
        imageHeight: 1,
        displayX: 0,
        displayY: 0,
        displayWidth: 1,
        displayHeight: 1,
        scaleFactor: 1,
        cursorImageX: null,
        cursorImageY: null,
      }),
      runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
      cancelRunCommand: async () => {},
      pointerMoveTo: async (x, y) => {
        calls.push(`pointerMoveTo:${x},${y}`);
        return { cursorImageX: x + 2, cursorImageY: y - 1 };
      },
      pointerClick: async () => {
        calls.push("pointerClick");
      },
      typeText: async () => {
        calls.push("typeText");
      },
      keyTap: async () => {
        calls.push("keyTap");
      },
      resetPointerAutomationCancel: async () => {
        calls.push("resetPointerAutomationCancel");
      },
      cancelPointerAutomation: async () => {
        calls.push("cancelPointerAutomation");
      },
    },
  };
}

function createTestContext(native: AgentNativeBridge): LiveAgentToolContext {
  const events: AgentEvent[] = [];

  return {
    taskId: "task-1",
    native,
    workspaceFiles: {
      readFile: async () => "",
      listDirectory: async () => [],
      writeFile: async () => "",
      copyFile: async () => "",
      movePath: async () => "",
    },
    hostOs: "windows",
    workspaceRoot: "D:\\Projects\\actuate",
    signal: new AbortController().signal,
    permissionMode: "ask_all",
    uiAutomationEnabled: true,
    persistedToolApprovals: new Set(),
    sessionRiskApproved: new Set(),
    vision: { latestCapture: null },
    uiAutomation: createUiAutomationRunState(),
    emit: (event) => {
      events.push(event);
    },
    waitForPermission: async () => "allow_once",
    persistAlwaysAllow: async () => {},
    appendStructuredLog: async () => {},
  };
}

describe("uiAutomationTools", () => {
  test("clears stale pointer cancellation before click, typing, and key taps", async () => {
    const { native, calls } = createNativeSpy();
    const ctx = createTestContext(native);

    await createPointerClickTool(ctx).execute(
      { button: "left" },
      { toolCallId: "click-1", messages: [] },
    );
    await createTypeTextTool(ctx).execute(
      { text: "hello world" },
      { toolCallId: "type-1", messages: [] },
    );
    await createKeyTapTool(ctx).execute({ key: "enter" }, { toolCallId: "key-1", messages: [] });

    expect(calls).toEqual([
      "resetPointerAutomationCancel",
      "pointerClick",
      "resetPointerAutomationCancel",
      "typeText",
      "resetPointerAutomationCancel",
      "keyTap",
    ]);
  });

  test("pointer_move returns cursor evidence after move", async () => {
    const { native } = createNativeSpy();
    const ctx = createTestContext(native);

    const result = await createPointerMoveTool(ctx).execute(
      { x: 100, y: 200 },
      { toolCallId: "move-1", messages: [] },
    );

    expect(result).toMatchObject({
      ok: true,
      targetX: 100,
      targetY: 200,
      cursorImageX: 102,
      cursorImageY: 199,
      deltaX: 2,
      deltaY: -1,
    });
  });

  test("ui_focus_type runs move-click-type in order and records idempotency", async () => {
    const { native, calls } = createNativeSpy();
    const ctx = createTestContext(native);
    const tool = createUiFocusTypeTool(ctx);
    const input = { x: 500, y: 900, text: "hello world" };

    const first = await tool.execute(input, { toolCallId: "focus-1", messages: [] });
    const second = await tool.execute(input, { toolCallId: "focus-2", messages: [] });

    expect(first).toMatchObject({
      ok: true,
      skipped: false,
      targetX: 500,
      targetY: 900,
      textLength: 11,
      submitted: false,
    });
    expect(second).toMatchObject({
      ok: true,
      skipped: true,
      reason: "already_attempted",
    });
    expect(calls).toEqual([
      "resetPointerAutomationCancel",
      "pointerMoveTo:500,900",
      "pointerClick",
      "typeText",
    ]);
  });

  test("ui_focus_type optionally submits with enter", async () => {
    const { native, calls } = createNativeSpy();
    const ctx = createTestContext(native);

    await createUiFocusTypeTool(ctx).execute(
      { x: 10, y: 20, text: "go", submit: true },
      { toolCallId: "focus-submit", messages: [] },
    );

    expect(calls).toContain("keyTap");
  });
});
