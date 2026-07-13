import { z } from "zod";

import { getCachedPlatformCapabilities } from "@/lib/native/platform";

import { defineCapability } from "../types";

function launchExeDescription(): string {
  switch (getCachedPlatformCapabilities().os) {
    case "macos":
      return "Executable path, short name, or .app (e.g. TextEdit, Calculator, /Applications/Safari.app, /bin/ls)";
    case "windows":
      return "Executable path or short name (e.g. notepad, msedge, chrome)";
    default:
      return "Executable path or short name on PATH";
  }
}

function launchCapabilityDescription(): string {
  switch (getCachedPlatformCapabilities().os) {
    case "macos":
      return "Launch an executable without capturing stdout/stderr. Accepts absolute paths, PATH names, or .app bundles (resolves Contents/MacOS). Examples: TextEdit, Calculator, /bin/ls. Returns the spawned process id.";
    case "windows":
      return "Launch an executable without capturing stdout/stderr. Accepts absolute paths or short names (e.g. notepad, msedge, chrome) via App Paths / PATH. Returns the spawned process id.";
    default:
      return "Launch an executable without capturing stdout/stderr. Accepts absolute paths or PATH names. Returns the spawned process id.";
  }
}

export const launchInputSchema = z.object({
  exe: z.string().min(1).describe(launchExeDescription()),
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
  description: launchCapabilityDescription(),
  risk: "high",
  inputSchema: launchInputSchema,
});
