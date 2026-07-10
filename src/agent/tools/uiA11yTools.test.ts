import { describe, expect, test } from "bun:test";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { createUiA11yInteractTool, createUiA11ySnapshotTool } from "@/agent/tools/uiA11yTools";
import { createUiAutomationRunState, rememberA11ySnapshot } from "@/agent/tools/uiAutomationState";

function mockCtx(overrides: Partial<LiveAgentToolContext> = {}): LiveAgentToolContext {
  return {
    taskId: "task-1",
    native: {
      uiA11ySnapshot: async () => ({
        platform: "windows",
        app: "TestApp",
        elementCount: 3,
        interactiveCount: 1,
        truncated: false,
        treeText: "button @e1",
        interactiveRefs: [{ id: "@e1", role: "button", name: "OK", enabled: true }],
        nextStep: "interact",
      }),
      uiA11yInteract: async () => ({
        action: "click",
        elementId: "@e1",
        message: "clicked",
      }),
    } as LiveAgentToolContext["native"],
    workspaceFiles: {} as LiveAgentToolContext["workspaceFiles"],
    hostOs: "windows",
    workspaceRoot: null,
    signal: new AbortController().signal,
    permissionMode: "ask_risky",
    uiAutomationEnabled: true,
    persistedToolApprovals: new Set(),
    sessionRiskApproved: new Set(),
    vision: { latestCapture: null },
    a11y: { latestSnapshot: null, treeAttached: false },
    uiAutomation: createUiAutomationRunState(),
    emit: () => {},
    waitForPermission: async () => "allow_once",
    persistAlwaysAllow: async () => {},
    appendStructuredLog: async () => {},
    ...overrides,
  };
}

describe("uiA11yTools", () => {
  test("snapshot preflight blocks repeat snapshot without interact", async () => {
    const uiAutomation = createUiAutomationRunState();
    rememberA11ySnapshot(uiAutomation);
    const tool = createUiA11ySnapshotTool(mockCtx({ uiAutomation }));
    const result = await tool.execute?.({}, { toolCallId: "1", messages: [] });
    expect(result).toMatchObject({ ok: false });
  });

  test("interact requires text for set_value", async () => {
    const tool = createUiA11yInteractTool(mockCtx());
    const result = await tool.execute?.(
      { element_id: "@e1", action: "set_value" },
      { toolCallId: "1", messages: [] },
    );
    expect(result).toMatchObject({ ok: false });
  });
});
