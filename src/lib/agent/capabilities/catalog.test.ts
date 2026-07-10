import { describe, expect, test } from "bun:test";

import { getV1Capabilities } from "./catalog";

describe("capability catalog", () => {
  test("registers wait, file-system, window, and shell toolsets", () => {
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
        "window_list",
        "get_active_window",
        "process_list",
        "process_info",
        "get_env",
      ]),
    );
    expect(names).toHaveLength(34);
  });
});
