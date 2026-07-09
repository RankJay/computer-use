import { z } from "zod";

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
  needsWorkspaceRoot: true,
  inputSchema: patchFileInputSchema,
});
