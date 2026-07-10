import { z } from "zod";

import { defineCapability } from "../types";

export const statPathInputSchema = z.object({
  path: z.string().min(1).describe("Relative path from workspace root"),
});

export type StatPathInput = z.infer<typeof statPathInputSchema>;

export type StatPathOutput = {
  path: string;
  kind: string;
  sizeBytes: number;
  modifiedAt: string;
  createdAt?: string;
  readonly: boolean;
};

export const statPathCapability = defineCapability({
  name: "stat_path",
  description: "Get file or directory metadata from the workspace",
  risk: "low",
  needsWorkspaceRoot: true,
  inputSchema: statPathInputSchema,
});
