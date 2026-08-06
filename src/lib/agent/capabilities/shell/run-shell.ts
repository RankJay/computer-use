import { z } from "zod";

import { defineCapability } from "../types";

export const runShellInputSchema = z.object({
  program: z.string().min(1).describe("Executable or command to run"),
  args: z
    .array(z.string())
    .optional()
    .describe(
      'Argument list as JSON strings, e.g. ["--flag", "value"] — never a bare shell string',
    ),
  cwd: z.string().optional().describe("Absolute working directory; defaults to the process cwd"),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe("Extra environment variables for this invocation"),
});

export type RunShellInput = z.infer<typeof runShellInputSchema>;

export type RunShellOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cwd: string | null;
};

export const runShellCapability = defineCapability({
  name: "run_shell",
  description:
    "Run a shell command or executable anywhere on the system. Returns stdout, stderr, and exit code. Not for UI: never use xdotool, osascript/System Events, AppleScript keystrokes, or similar — use accessibility_* / type_text / mouse_* / hotkey instead.",
  risk: "medium",
  inputSchema: runShellInputSchema,
});
