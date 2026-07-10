import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { waitInputSchema } from "./wait";

describe("wait capability", () => {
  test("schema rejects invalid durations", () => {
    expect(waitInputSchema.safeParse({ ms: 0 }).success).toBe(false);
    expect(waitInputSchema.safeParse({ ms: 60_001 }).success).toBe(false);
    expect(waitInputSchema.safeParse({ ms: 1.5 }).success).toBe(false);
  });

  test("invokeCapability returns elapsed wait result", async () => {
    const result = await invokeCapability(
      "wait",
      { ms: 25 },
      {
        emit: () => {},
        taskId: "task-1",
        settings: DEFAULT_SETTINGS,
        workspaceRoot: "D:/Projects/actuate-v2",
        executeNative: createMockCapabilityInvoker({
          wait: async () => ({ ms: 25, elapsedMs: 30 }),
        }),
      },
    );

    expect(result).toEqual({
      ok: true,
      output: { ms: 25, elapsedMs: 30 },
    });
  });
});
