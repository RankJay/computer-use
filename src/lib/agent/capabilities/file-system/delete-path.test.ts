import { describe, expect, test } from "bun:test";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { deletePathInputSchema } from "./delete-path";

describe("delete_path capability", () => {
  test("schema requires path", () => {
    expect(deletePathInputSchema.safeParse({}).success).toBe(false);
    expect(deletePathInputSchema.safeParse({ path: "tmp/a.txt" }).success).toBe(true);
  });

  test("invokeCapability deletes via native handler", async () => {
    const result = await invokeCapability(
      "delete_path",
      { path: "tmp/a.txt" },
      createApprovedInvokeDeps({
        executeNative: createMockCapabilityInvoker({
          delete_path: async () => ({ path: "tmp/a.txt" }),
        }),
      }),
    );

    expect(result).toEqual({ ok: true, output: { path: "tmp/a.txt" } });
  });
});
