import { describe, expect, test } from "bun:test";

import { renameRelativePath } from "@/agent/tools/workspacePathUtils";

describe("renameRelativePath", () => {
  test("renames a root-level file", () => {
    expect(renameRelativePath("old.txt", "new.txt")).toBe("new.txt");
  });

  test("renames a nested path", () => {
    expect(renameRelativePath("src/agent/old.ts", "new.ts")).toBe("src/agent/new.ts");
  });

  test("rejects path separators in newName", () => {
    expect(() => renameRelativePath("a.txt", "b/c.txt")).toThrow(/path separators/);
  });
});
