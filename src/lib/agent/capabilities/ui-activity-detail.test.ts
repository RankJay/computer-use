import { describe, expect, test } from "bun:test";

import { toolActivityDetail } from "./ui-activity-detail";

describe("toolActivityDetail", () => {
  test("shortens file paths to basename", () => {
    expect(toolActivityDetail("read_file", { path: "src/lib/agent/foo.ts" })).toBe("foo.ts");
    expect(toolActivityDetail("write_file", { path: "D:\\Projects\\actuate\\package.json" })).toBe(
      "package.json",
    );
  });

  test("formats shell program and args", () => {
    expect(toolActivityDetail("run_shell", { program: "bun", args: ["test"] })).toBe("bun test");
    expect(toolActivityDetail("run_shell", { program: "ls" })).toBe("ls");
  });

  test("joins hotkey chords", () => {
    expect(toolActivityDetail("hotkey", { keys: ["ctrl", "shift", "t"] })).toBe("ctrl+shift+t");
  });

  test("picks app, name, query, url, cwd when present", () => {
    expect(toolActivityDetail("launch", { app: "Safari" })).toBe("Safari");
    expect(toolActivityDetail("window_focus", { name: "Terminal" })).toBe("Terminal");
    expect(toolActivityDetail("search_files", { query: "ToolPart" })).toBe("ToolPart");
    expect(toolActivityDetail("open", { url: "https://example.com" })).toBe("https://example.com");
    expect(toolActivityDetail("run_shell", { cwd: "/Users/me/projects/app" })).toBe("app");
  });

  test("prefers path and program over weaker fields", () => {
    expect(
      toolActivityDetail("run_shell", {
        program: "bun",
        args: ["run", "dev"],
        cwd: "/tmp/work",
      }),
    ).toBe("bun run dev");
    expect(toolActivityDetail("read_file", { path: "a/b/c.txt", query: "ignored" })).toBe("c.txt");
  });

  test("returns null for empty or uninteresting input", () => {
    expect(toolActivityDetail("mouse_click", { x: 10, y: 20, button: "left" })).toBeNull();
    expect(toolActivityDetail("wait", {})).toBeNull();
    expect(toolActivityDetail("wait", null)).toBeNull();
    expect(toolActivityDetail("wait", "nope")).toBeNull();
  });

  test("truncates long details", () => {
    const long = "a".repeat(80);
    const detail = toolActivityDetail("run_shell", { program: long });
    expect(detail).not.toBeNull();
    expect(detail!.length).toBeLessThanOrEqual(56);
    expect(detail!.endsWith("…")).toBe(true);
  });
});
