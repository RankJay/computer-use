import { z } from "zod";

import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const runTestsInputSchema = z.object({
  suite: z.string().describe("Test path or filter passed to bun test"),
});

export type RunTestsInput = z.infer<typeof runTestsInputSchema>;

export type RunTestsOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  passed: boolean;
};

export const runTestsCapability = defineCapability({
  name: "run_tests",
  description: "Run the project test suite with bun test",
  risk: "medium",
  inputSchema: runTestsInputSchema,
  execute: async (input, ctx) => {
    const result = await invokeCapabilityCommand<{
      exit_code: number;
      stdout: string;
      stderr: string;
      passed: boolean;
    }>("run_tests", {
      suite: input.suite,
      workspaceRoot: ctx.workspaceRoot,
    });

    return {
      exitCode: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      passed: result.passed,
    } satisfies RunTestsOutput;
  },
});
