import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const writeFileInputSchema = z.object({
  path: z.string().min(1).describe("Relative path from workspace root"),
  content: z.string().describe("UTF-8 file contents to write"),
});

export type WriteFileInput = z.infer<typeof writeFileInputSchema>;

export const writeFileCapability = defineCapability({
  name: "write_file",
  description: "Create or overwrite a UTF-8 text file in the workspace",
  risk: "high",
  inputSchema: writeFileInputSchema,
  execute: async (input, ctx) => {
    await invokeCapabilityCommand("write_file", {
      path: input.path,
      content: input.content,
      workspaceRoot: ctx.workspaceRoot,
    });
    return { path: input.path };
  },
});
