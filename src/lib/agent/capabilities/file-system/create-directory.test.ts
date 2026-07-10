import { describe, expect, test } from "bun:test";

import { invokeCapability } from "../invoke";
import { createMockCapabilityInvoker } from "../tauri-invoke";
import { createApprovedInvokeDeps } from "../test-helpers";
import { createDirectoryInputSchema } from "./create-directory";

describe("create_directory capability", () => {
  test("schema accepts recursive flag", () => {
    expect(createDirectoryInputSchema.safeParse({ path: "a/b", recursive: true }).success).toBe(
      true,
    );
  });

  test("invokeCapability creates directory", async () => {
    const result = await invokeCapability(
      "create_directory",
      { path: "a/b", recursive: true },
      createApprovedInvokeDeps({
        executeNative: createMockCapabilityInvoker({
          create_directory: async () => ({ path: "a/b", created: true }),
        }),
      }),
    );

    expect(result).toEqual({ ok: true, output: { path: "a/b", created: true } });
  });
});
