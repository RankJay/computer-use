import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
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
  inputSchema: statPathInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      path: string;
      kind: string;
      sizeBytes: number;
      modifiedAt: string;
      createdAt?: string;
      readonly: boolean;
    }>("stat_path", {
      path: input.path,
      workspaceRoot: ctx.workspaceRoot,
    });

    return result satisfies StatPathOutput;
  },
});
