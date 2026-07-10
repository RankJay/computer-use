import { describe, expect, test } from "bun:test";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { duplicatePathInputSchema } from "./duplicate-path";

describe("duplicate_path capability", () => {
  test("schema requires from and to", () => {
    expect(duplicatePathInputSchema.safeParse({ from: "a", to: "b" }).success).toBe(true);
  });

  test("invokeCapability duplicates path", async () => {
    const result = await invokeCapability(
      "duplicate_path",
      { from: "src", to: "dst" },
      createApprovedInvokeDeps({
        executeNative: createMockCapabilityInvoker({
          duplicate_path: async () => ({ from: "src", to: "dst", kind: "directory" }),
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      output: { from: "src", to: "dst", kind: "directory" },
    });
  });
});
