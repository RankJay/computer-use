import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const patchFileInputSchema = z.object({
  path: z.string().min(1).describe("Relative file path from workspace root"),
  diff: z.string().min(1).describe("Unified diff to apply to the file"),
});

export type PatchFileInput = z.infer<typeof patchFileInputSchema>;

export type PatchFileOutput = {
  path: string;
  bytesWritten: number;
  hunksApplied: number;
};

export const patchFileCapability = defineCapability({
  name: "patch_file",
  description: "Apply a unified diff patch to a workspace file",
  risk: "high",
  inputSchema: patchFileInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      path: string;
      bytesWritten: number;
      hunksApplied: number;
    }>("patch_file", {
      path: input.path,
      diff: input.diff,
      workspaceRoot: ctx.workspaceRoot,
    });

    return result satisfies PatchFileOutput;
  },
});
