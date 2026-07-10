import { z } from "zod";

import { defineCapability } from "../types";

export const readFileInputSchema = z.object({
  path: z.string().min(1).describe("Relative path from workspace root"),
});

export type ReadFileInput = z.infer<typeof readFileInputSchema>;

export type ReadFileOutput = {
  path: string;
  content: string;
  bytes: number;
};

export const readFileCapability = defineCapability({
  name: "read_file",
  description: "Read a UTF-8 text file from the workspace",
  risk: "low",
  needsWorkspaceRoot: true,
  inputSchema: readFileInputSchema,
});
