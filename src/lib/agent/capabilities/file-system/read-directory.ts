import { z } from "zod";

import { defineCapability } from "../types";

export const readDirectoryInputSchema = z.object({
  path: z.string().min(1).describe("Relative directory path from workspace root"),
});

export type ReadDirectoryInput = z.infer<typeof readDirectoryInputSchema>;

export type ReadDirectoryOutput = {
  path: string;
  entries: Array<{
    name: string;
    kind: string;
    sizeBytes?: number;
  }>;
};

export const readDirectoryCapability = defineCapability({
  name: "read_directory",
  description: "List entries in a workspace directory",
  risk: "low",
  needsWorkspaceRoot: true,
  inputSchema: readDirectoryInputSchema,
});
