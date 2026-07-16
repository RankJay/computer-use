import { z } from "zod";

import { defineCapability } from "../types";

export const processKillInputSchema = z
  .object({
    pid: z.number().int().positive().optional().describe("Process id to terminate"),
    name: z.string().min(1).optional().describe("Executable name to terminate when pid is omitted"),
  })
  .refine((input) => (input.pid !== undefined) !== (input.name !== undefined), {
    message: "Provide exactly one of pid or name",
  });

export type ProcessKillInput = z.infer<typeof processKillInputSchema>;

export type ProcessKillOutput = {
  pid: number;
  name: string | null;
};

export const processKillCapability = defineCapability({
  name: "process_kill",
  description: "Terminate a running process by pid or executable name.",
  risk: "high",
  destructive: true,
  inputSchema: processKillInputSchema,
});
