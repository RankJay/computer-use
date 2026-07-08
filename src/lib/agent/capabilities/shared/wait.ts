import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const waitInputSchema = z.object({
  ms: z.number().int().min(1).max(60_000).describe("Duration to wait in milliseconds (1-60000)"),
});

export type WaitInput = z.infer<typeof waitInputSchema>;

export type WaitOutput = {
  ms: number;
  elapsedMs: number;
};

export const waitCapability = defineCapability({
  name: "wait",
  description: "Wait for an explicit period before continuing",
  risk: "low",
  inputSchema: waitInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ms: number;
      elapsed_ms: number;
    }>("wait", { ms: input.ms });

    return {
      ms: result.ms,
      elapsedMs: result.elapsed_ms,
    } satisfies WaitOutput;
  },
});
