import { z } from "zod";

import { defineCapability } from "../types";

export const processInfoInputSchema = z.object({
  pid: z.number().int().positive().describe("Process id from process_list"),
});

export type ProcessInfoOutput = {
  pid: number;
  name: string;
  memoryBytes: number;
  cpuPercent: number | null;
};

export const processInfoCapability = defineCapability({
  name: "process_info",
  description: "Get memory usage and process name for a running process.",
  risk: "low",
  inputSchema: processInfoInputSchema,
});
