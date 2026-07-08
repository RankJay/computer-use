import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { readDirectoryInputSchema } from "./read-directory";

describe("read_directory capability", () => {
  test("schema requires path", () => {
    expect(readDirectoryInputSchema.safeParse({ path: "src" }).success).toBe(true);
  });

  test("invokeCapability returns directory entries", async () => {
    const result = await invokeCapability(
      "read_directory",
      { path: "src" },
      {
        emit: () => {},
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({
          read_directory: async () => ({
            path: "src",
            entries: [{ name: "main.ts", kind: "file", sizeBytes: 12 }],
          }),
        }),
      },
    );

    expect(result.ok).toBe(true);
  });
});
