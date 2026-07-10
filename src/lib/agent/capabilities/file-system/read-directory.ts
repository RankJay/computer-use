import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
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
  inputSchema: readDirectoryInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      path: string;
      entries: Array<{
        name: string;
        kind: string;
        sizeBytes?: number;
      }>;
    }>("read_directory", {
      path: input.path,
      workspaceRoot: ctx.workspaceRoot,
    });

    return result satisfies ReadDirectoryOutput;
  },
});
