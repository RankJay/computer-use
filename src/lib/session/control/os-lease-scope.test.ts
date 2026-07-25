import { describe, expect, test } from "bun:test";

import { osLeaseScopeOf } from "./os-lease-scope";

describe("osLeaseScopeOf", () => {
  test("computer_use and focus-steal need desktop", () => {
    expect(osLeaseScopeOf("mouse_click")).toBe("desktop");
    expect(osLeaseScopeOf("key_press")).toBe("desktop");
    expect(osLeaseScopeOf("hotkey")).toBe("desktop");
    expect(osLeaseScopeOf("accessibility_click")).toBe("desktop");
    expect(osLeaseScopeOf("window_focus")).toBe("desktop");
    expect(osLeaseScopeOf("window_move")).toBe("desktop");
  });

  test("fs/shell/clipboard/read-only window need none", () => {
    expect(osLeaseScopeOf("read_file")).toBe("none");
    expect(osLeaseScopeOf("run_shell")).toBe("none");
    expect(osLeaseScopeOf("read_clipboard")).toBe("none");
    expect(osLeaseScopeOf("window_list")).toBe("none");
    expect(osLeaseScopeOf("get_active_window")).toBe("none");
    expect(osLeaseScopeOf("screenshot")).toBe("none");
  });
});
