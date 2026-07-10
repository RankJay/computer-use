import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const movePathInputSchema = z.object({
  from: z.string().min(1).describe("Source path relative to workspace root"),
  to: z.string().min(1).describe("Destination path relative to workspace root"),
});

export type MovePathInput = z.infer<typeof movePathInputSchema>;

export type MovePathOutput = {
  from: string;
  to: string;
};

export const movePathCapability = defineCapability({
  name: "move_path",
  description: "Move or rename a file or directory within the workspace",
  risk: "high",
  inputSchema: movePathInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      from: string;
      to: string;
    }>("move_path", {
      from: input.from,
      to: input.to,
      workspaceRoot: ctx.workspaceRoot,
    });

    return result satisfies MovePathOutput;
  },
});
