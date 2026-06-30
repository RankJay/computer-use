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
        effectiveScaleFactor: 1,
        gridCellPx: 16,
        blockColumns: 1,
        blockRows: 1,
        cursorBlockX: null,
        cursorBlockY: null,
      }),
      runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
      cancelRunCommand: async () => {},
      pointerMoveTo: async (blockX, blockY) => {
        calls.push(`pointerMoveTo:${blockX},${blockY}`);
        return { cursorBlockX: blockX + 1, cursorBlockY: blockY - 1 };
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
      { blockX: 3, blockY: 4 },
      { toolCallId: "move-1", messages: [] },
    );

    expect(result).toMatchObject({
      ok: true,
      targetBlockX: 3,
      targetBlockY: 4,
      cursorBlockX: 4,
      cursorBlockY: 3,
      deltaX: 1,
      deltaY: -1,
    });
  });

  test("pointer_move rejects target equal to cursor block from last capture", async () => {
    const { native } = createNativeSpy();
    const ctx = createTestContext(native);
    ctx.uiAutomation.lastCaptureCursorBlockX = 16;
    ctx.uiAutomation.lastCaptureCursorBlockY = 7;

    const result = await createPointerMoveTool(ctx).execute(
      { blockX: 16, blockY: 7 },
      { toolCallId: "move-cursor", messages: [] },
    );

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("where the mouse already is"),
    });
  });

  test("ui_focus_type runs move-click-type in order and records idempotency", async () => {
    const { native, calls } = createNativeSpy();
    const ctx = createTestContext(native);
    const tool = createUiFocusTypeTool(ctx);
    const input = { blockX: 25, blockY: 30, text: "hello world" };

    const first = await tool.execute(input, { toolCallId: "focus-1", messages: [] });
    const second = await tool.execute(input, { toolCallId: "focus-2", messages: [] });

    expect(first).toMatchObject({
      ok: true,
      skipped: false,
      targetBlockX: 25,
      targetBlockY: 30,
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
      "pointerMoveTo:25,30",
      "pointerClick",
      "typeText",
    ]);
  });

  test("ui_focus_type optionally submits with enter", async () => {
    const { native, calls } = createNativeSpy();
    const ctx = createTestContext(native);

    await createUiFocusTypeTool(ctx).execute(
      { blockX: 1, blockY: 2, text: "go", submit: true },
      { toolCallId: "focus-submit", messages: [] },
    );

    expect(calls).toContain("keyTap");
  });
});
