import { z } from "zod";

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
});
