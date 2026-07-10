import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "../invoke";
import { needsPermission } from "../permission";
import { buildAgentTools } from "../registry";
import { windowListCapability } from "./list";

describe("window capabilities", () => {
  test("window_list is low risk", () => {
    expect(
      needsPermission(
        { name: "window_list", risk: "low" },
        { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
      ),
    ).toBe(false);
  });

  test("window tools are available when uiAutomation is disabled", () => {
    const tools = buildAgentTools({
      emit: () => {},
      taskId: "task-1",
      settings: { ...DEFAULT_SETTINGS, uiAutomation: false },
      workspaceRoot: "D:/Projects/actuate-v2",
      executeNative: async () => ({}),
    });

    expect(tools.window_list).toBeDefined();
    expect(tools.get_active_window).toBeDefined();
  });

  test("invokeCapability returns window_list output", async () => {
    const result = await invokeCapability(
      "window_list",
      {},
      {
        emit: () => {},
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: async () => ({ text: '123  notepad.exe  "Untitled"' }),
      },
      "call-1",
    );

    expect(result).toEqual({
      ok: true,
      output: { text: '123  notepad.exe  "Untitled"' },
    });
  });

  test("window_list capability has no uiAutomation gate", () => {
    expect(windowListCapability.enabledWhen).toBeUndefined();
  });
});
