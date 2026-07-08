import { describe, expect, test } from "bun:test";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { movePathInputSchema } from "./move-path";

describe("move_path capability", () => {
  test("schema requires from and to", () => {
    expect(movePathInputSchema.safeParse({ from: "a.txt", to: "b.txt" }).success).toBe(true);
  });

  test("invokeCapability moves path", async () => {
    const result = await invokeCapability(
      "move_path",
      { from: "a.txt", to: "b.txt" },
      createApprovedInvokeDeps({
        executeNative: createMockCapabilityInvoker({
          move_path: async () => ({ from: "a.txt", to: "b.txt" }),
        }),
      }),
    );

    expect(result).toEqual({ ok: true, output: { from: "a.txt", to: "b.txt" } });
  });
});
