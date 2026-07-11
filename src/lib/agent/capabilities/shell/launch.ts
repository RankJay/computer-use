import { z } from "zod";

import { defineCapability } from "../types";

export const launchInputSchema = z.object({
  exe: z.string().min(1).describe("Executable path or short name (e.g. chrome, notepad, msedge)"),
  args: z.array(z.string()).optional().describe("Arguments passed to the executable"),
  cwd: z.string().optional().describe("Absolute working directory; defaults to the process cwd"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe("Extra environment variables for this launch"),
});

export type LaunchInput = z.infer<typeof launchInputSchema>;

export type LaunchOutput = {
  pid: number;
  exe: string;
};

export const launchCapability = defineCapability({
  name: "launch",
  description:
    "Launch an executable without capturing stdout/stderr. Accepts absolute paths or short names (chrome, notepad) resolved via Windows App Paths / well-known install locations. Returns the spawned process id.",
  risk: "high",
  inputSchema: launchInputSchema,
});
