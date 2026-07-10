import { z } from "zod";

import { defineCapability } from "../types";

export const duplicatePathInputSchema = z.object({
  from: z.string().min(1).describe("Source path relative to workspace root"),
  to: z.string().min(1).describe("Destination path relative to workspace root"),
});

export type DuplicatePathInput = z.infer<typeof duplicatePathInputSchema>;

export type DuplicatePathOutput = {
  from: string;
  to: string;
  kind: string;
};

export const duplicatePathCapability = defineCapability({
  name: "duplicate_path",
  description: "Duplicate a file or directory within the workspace",
  risk: "high",
  needsWorkspaceRoot: true,
  inputSchema: duplicatePathInputSchema,
});
