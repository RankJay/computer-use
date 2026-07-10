import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { statPathInputSchema } from "./stat-path";

describe("stat_path capability", () => {
  test("schema requires path", () => {
    expect(statPathInputSchema.safeParse({ path: "README.md" }).success).toBe(true);
  });

  test("invokeCapability returns metadata", async () => {
    const result = await invokeCapability(
      "stat_path",
      { path: "README.md" },
      {
        emit: () => {},
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({
          stat_path: async () => ({
            path: "README.md",
            kind: "file",
            sizeBytes: 42,
            modifiedAt: "2026-01-01T00:00:00Z",
            readonly: false,
          }),
        }),
      },
    );

    expect(result.ok).toBe(true);
  });
});
