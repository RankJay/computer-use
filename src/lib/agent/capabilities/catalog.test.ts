import { describe, expect, test } from "bun:test";

import { hostSupportsUiAutomation } from "@/lib/agent/capabilities/shared/ui-automation";
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
        "accessibility_query",
        "accessibility_find_element",
        "accessibility_wait",
        "accessibility_get_text",
        "accessibility_get_focused",
        "accessibility_element_at_point",
        "accessibility_inspect",
        "accessibility_get_selection",
        "accessibility_click",
        "accessibility_set_value",
        "accessibility_get_value",
        "accessibility_scroll_element",
        "accessibility_right_click_element",
        "accessibility_invoke_action",
        "accessibility_send_keys",
        "accessibility_focus",
        "read_clipboard_html",
        "write_clipboard_html",
        "read_clipboard_image",
        "write_clipboard_image",
        "mouse_move",
        "mouse_click",
        "mouse_scroll",
        "mouse_drag",
        "mouse_hover",
        "mouse_down",
        "mouse_up",
        "hotkey",
        "key_down",
        "key_up",
        "key_press",
      ]),
    );
    expect(names).not.toContain("accessibility_expand_node");
    expect(names).toHaveLength(59);
  });

  test("groups names by risk", () => {
    const byRisk = getCapabilityNamesByRisk();
    expect(byRisk.low).toContain("read_file");
    expect(byRisk.medium).toContain("run_shell");
    expect(byRisk.high).toContain("mouse_click");
    expect(byRisk.high).toContain("hotkey");
    expect(byRisk.medium).toContain("read_clipboard");
    expect(byRisk.medium).toContain("read_clipboard_image");
    expect(byRisk.medium).toContain("write_clipboard_html");
  });

  test("filters accessibility tools when uiAutomation is off", () => {
    const off = getCapabilityNamesByRisk({ ...DEFAULT_SETTINGS, uiAutomation: false });
    const on = getCapabilityNamesByRisk({ ...DEFAULT_SETTINGS, uiAutomation: true });
    const hostSupports = hostSupportsUiAutomation();

    expect(off.high).not.toContain("accessibility_snapshot");
    expect(off.high).not.toContain("accessibility_click");
    expect(off.high).not.toContain("accessibility_get_value");
    expect(off.high).not.toContain("accessibility_invoke_action");
    expect(off.high).not.toContain("mouse_move");
    expect(off.high).not.toContain("hotkey");
    expect(off.high).not.toContain("key_press");

    if (!hostSupports) {
      expect(on.high).not.toContain("accessibility_snapshot");
      expect(on.high).not.toContain("mouse_click");
      expect(on.high).not.toContain("hotkey");
      return;
    }

    expect(on.high).toContain("accessibility_snapshot");
    expect(on.high).toContain("accessibility_query");
    expect(on.high).toContain("accessibility_wait");
    expect(on.high).toContain("accessibility_get_text");
    expect(on.high).toContain("accessibility_get_focused");
    expect(on.high).toContain("accessibility_element_at_point");
    expect(on.high).toContain("accessibility_inspect");
    expect(on.high).toContain("accessibility_get_selection");
    expect(on.high).toContain("accessibility_click");
    expect(on.high).toContain("accessibility_get_value");
    expect(on.high).toContain("accessibility_scroll_element");
    expect(on.high).toContain("accessibility_right_click_element");
    expect(on.high).toContain("accessibility_invoke_action");
    expect(on.high).toContain("mouse_click");
    expect(on.high).toContain("mouse_drag");
    expect(on.high).toContain("hotkey");
    expect(on.high).toContain("key_down");
  });

  test("gates window tools from platform capability cache", () => {
    const byRisk = getCapabilityNamesByRisk(DEFAULT_SETTINGS);
    const hostSupports = hostSupportsUiAutomation();
    if (hostSupports) {
      expect(byRisk.low).toContain("window_list");
      expect(byRisk.low).toContain("get_active_window");
      expect(byRisk.medium).toContain("window_focus");
    } else {
      expect(byRisk.low).not.toContain("window_list");
      expect(byRisk.medium).not.toContain("window_focus");
    }
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
