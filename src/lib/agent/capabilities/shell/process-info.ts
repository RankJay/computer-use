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
  description:
    "Get memory usage, process name, and CPU percent (averaged over a short ~150ms sample) for a running process.",
  risk: "low",
  inputSchema: processInfoInputSchema,
});
