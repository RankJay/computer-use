import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const deleteFileInputSchema = z.object({
  filePath: z.string().min(1).describe("Relative path from workspace root"),
});

export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

export const deleteFileCapability = defineCapability({
  name: "delete_file",
  description: "Delete a file from the workspace",
  risk: "high",
  inputSchema: deleteFileInputSchema,
  execute: async (input, ctx) => {
    await invokeCapabilityCommand("delete_file", {
      path: input.filePath,
      workspaceRoot: ctx.workspaceRoot,
    });
    return { filePath: input.filePath };
  },
});
