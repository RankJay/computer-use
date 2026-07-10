import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const createDirectoryInputSchema = z.object({
  path: z.string().min(1).describe("Relative directory path from workspace root"),
  recursive: z.boolean().optional().describe("Create parent directories when true"),
});

export type CreateDirectoryInput = z.infer<typeof createDirectoryInputSchema>;

export type CreateDirectoryOutput = {
  path: string;
  created: boolean;
};

export const createDirectoryCapability = defineCapability({
  name: "create_directory",
  description: "Create an empty directory in the workspace",
  risk: "high",
  inputSchema: createDirectoryInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      path: string;
      created: boolean;
    }>("create_directory", {
      path: input.path,
      recursive: input.recursive,
      workspaceRoot: ctx.workspaceRoot,
    });

    return result satisfies CreateDirectoryOutput;
  },
});
