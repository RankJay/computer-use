import { describe, expect, test } from "bun:test";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { patchFileInputSchema } from "./patch-file";

describe("patch_file capability", () => {
  test("schema requires path and diff", () => {
    expect(
      patchFileInputSchema.safeParse({
        path: "a.txt",
        diff: "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n",
      }).success,
    ).toBe(true);
  });

  test("invokeCapability applies patch", async () => {
    const result = await invokeCapability(
      "patch_file",
      { path: "a.txt", diff: "..." },
      createApprovedInvokeDeps({
        executeNative: createMockCapabilityInvoker({
          patch_file: async () => ({
            path: "a.txt",
            bytesWritten: 4,
            hunksApplied: 1,
          }),
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      output: { path: "a.txt", bytesWritten: 4, hunksApplied: 1 },
    });
  });
});
