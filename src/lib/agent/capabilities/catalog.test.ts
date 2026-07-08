import { describe, expect, test } from "bun:test";

import { getV1Capabilities } from "./catalog";

describe("capability catalog", () => {
  test("registers wait and full file-system toolset", () => {
    const names = getV1Capabilities().map((capability) => capability.name);

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
      ]),
    );
    expect(names).toHaveLength(23);
  });
});
