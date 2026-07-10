import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { getCapabilities, getCapabilityNamesByRisk } from "./catalog";

describe("capability catalog", () => {
  test("registers full toolset", () => {
    const names = getCapabilities().map((capability) => capability.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "wait",
        "read_file",
        "read_directory",
        "write_file",
        "create_directory",
        "patch_file",
        "delete_path",
        "move_path",
        "duplicate_path",
        "stat_path",
        "search_files",
        "window_list",
        "get_active_window",
        "process_list",
        "run_shell",
        "accessibility_snapshot",
        "read_clipboard_html",
        "write_clipboard_html",
        "read_clipboard_image",
        "write_clipboard_image",
      ]),
    );
    expect(names).toHaveLength(38);
  });

  test("groups names by risk", () => {
    const byRisk = getCapabilityNamesByRisk();
    expect(byRisk.low).toContain("read_file");
    expect(byRisk.high).toContain("run_shell");
    expect(byRisk.medium).toContain("read_clipboard");
    expect(byRisk.medium).toContain("read_clipboard_image");
    expect(byRisk.medium).toContain("write_clipboard_html");
  });

  test("filters accessibility tools when uiAutomation is off", () => {
    const off = getCapabilityNamesByRisk({ ...DEFAULT_SETTINGS, uiAutomation: false });
    const on = getCapabilityNamesByRisk({ ...DEFAULT_SETTINGS, uiAutomation: true });

    expect(off.high).not.toContain("accessibility_snapshot");
    expect(off.high).not.toContain("accessibility_click");
    expect(on.high).toContain("accessibility_snapshot");
    expect(on.high).toContain("accessibility_click");
  });

  test("workspace-root flag is set only on filesystem tools", () => {
    const withRoot = getCapabilities()
      .filter((capability) => capability.needsWorkspaceRoot)
      .map((capability) => capability.name)
      .sort();

    expect(withRoot).toEqual(
      [
        "create_directory",
        "delete_path",
        "duplicate_path",
        "move_path",
        "patch_file",
        "read_directory",
        "read_file",
        "search_files",
        "stat_path",
        "write_file",
      ].sort(),
    );
  });
});
