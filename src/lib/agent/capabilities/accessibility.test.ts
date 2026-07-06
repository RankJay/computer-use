import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { accessibilitySnapshotCapability } from "./accessibility-snapshot";
import { needsPermission } from "./permission";
import { buildAgentTools } from "./registry";

describe("accessibility capabilities", () => {
  test("read capabilities require permission in risky mode", () => {
    expect(
      needsPermission(
        { name: "accessibility_snapshot", risk: "high" },
        { ...DEFAULT_SETTINGS, permissionMode: "risky" },
      ),
    ).toBe(true);
  });

  test("list windows is low risk", () => {
    expect(
      needsPermission(
        { name: "accessibility_list_windows", risk: "low" },
        { ...DEFAULT_SETTINGS, permissionMode: "every-meaningful" },
      ),
    ).toBe(false);
  });

  test("accessibility tools are omitted when uiAutomation is disabled", () => {
    const tools = buildAgentTools({
      emit: () => {},
      taskId: "task-1",
      settings: { ...DEFAULT_SETTINGS, uiAutomation: false },
      workspaceRoot: "D:/Projects/actuate-v2",
      executeNative: async () => ({}),
    });

    expect(tools.accessibility_snapshot).toBeUndefined();
    expect(tools.read_file).toBeDefined();
  });

  test("accessibility tools are included when uiAutomation is enabled", () => {
    const tools = buildAgentTools({
      emit: () => {},
      taskId: "task-1",
      settings: { ...DEFAULT_SETTINGS, uiAutomation: true },
      workspaceRoot: "D:/Projects/actuate-v2",
      executeNative: async () => ({}),
    });

    expect(tools.accessibility_snapshot).toBeDefined();
    expect(
      accessibilitySnapshotCapability.enabledWhen?.({ ...DEFAULT_SETTINGS, uiAutomation: true }),
    ).toBe(true);
  });
});
