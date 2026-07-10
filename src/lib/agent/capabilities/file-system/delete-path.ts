import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const deletePathInputSchema = z.object({
  path: z.string().min(1).describe("Relative path from workspace root"),
});

export type DeletePathInput = z.infer<typeof deletePathInputSchema>;

export const deletePathCapability = defineCapability({
  name: "delete_path",
  description: "Delete a file or directory from the workspace",
  risk: "high",
  inputSchema: deletePathInputSchema,
  execute: async (input, ctx) => {
    await invokeCapabilityCommand("delete_path", {
      path: input.path,
      workspaceRoot: ctx.workspaceRoot,
    });
    return { path: input.path };
  },
});
