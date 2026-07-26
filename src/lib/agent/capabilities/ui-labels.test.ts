import { describe, expect, test } from "bun:test";

import { uiToolLabel } from "./ui-labels";

describe("uiToolLabel", () => {
  test("returns friendly labels across capability groups", () => {
    expect(uiToolLabel("mouse_move")).toBe("Surfing through your screen");
    expect(uiToolLabel("mouse_click_image")).toBe("Tapping a spot in the screenshot");
    expect(uiToolLabel("hotkey")).toBe("Striking a shortcut");
    expect(uiToolLabel("accessibility_snapshot")).toBe("Looking through your screen");
    expect(uiToolLabel("write_file")).toBe("Writing a file");
    expect(uiToolLabel("run_shell")).toBe("Running a command");
    expect(uiToolLabel("window_focus")).toBe("Bringing a window forward");
    expect(uiToolLabel("screenshot")).toBe("Taking a screenshot");
    expect(uiToolLabel("screenshot_region")).toBe("Zooming into the screenshot");
    expect(uiToolLabel("wait")).toBe("Pausing for a moment");
  });

  test("falls back to the canonical name for unmapped tools", () => {
    expect(uiToolLabel("unknown_tool")).toBe("unknown_tool");
  });
});
