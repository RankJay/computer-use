import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { terminalRunGuidanceForOs } from "@/agent/hostEnvironment";
import { AGENT_TOOL_NAMES, timeoutMsForTool } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";

let nextTerminalCancelToken = 1;

function createTerminalCancelToken(): number {
  const token = nextTerminalCancelToken;
  nextTerminalCancelToken = nextTerminalCancelToken === Number.MAX_SAFE_INTEGER ? 1 : token + 1;
  return token;
}

export function createTerminalRunTool(ctx: LiveAgentToolContext) {
  const hostShellHint = terminalRunGuidanceForOs(ctx.hostOs);
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.TERMINAL_RUN,
    description: `Run a terminal command (subprocess). Prefer short, non-interactive commands. Use for absolute paths outside the workspace (file tools are workspace-relative only). ${hostShellHint}`,
    inputSchema: zodSchema(
      z.object({
        program: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().nullable().optional(),
      }),
    ),
    nativeGate: "terminal",
    permission: (input) => {
      const command = `${input.program} ${input.args.join(" ")}`.trim();
      return {
        summary: shortenForTimeline(command, 120),
        rationale: "The model requested a local shell command.",
        details: `program: ${input.program}\nargs: ${JSON.stringify(input.args)}\ncwd: ${input.cwd ?? "(default)"}\n\ncommand:\n${command}`,
      };
    },
    deniedError: "User denied permission for terminal execution.",
    describe: (input) => shortenForTimeline(`${input.program} ${input.args.join(" ")}`),
    formatThrownErrorSummary: (message) => `Error: ${message}`,
    execute: async (input, executeCtx, native) => {
      const cancelToken = createTerminalCancelToken();
      executeCtx.setNativeCancel(() => native.cancelRunCommand(cancelToken));
      const result = await native.runCommand({
        program: input.program,
        args: input.args,
        cwd: input.cwd ?? ctx.workspaceRoot,
        timeoutMs: timeoutMsForTool(AGENT_TOOL_NAMES.TERMINAL_RUN),
        cancelToken,
      });
      const summary =
        result.code === 0
          ? `exit 0: ${shortenForTimeline(result.stdout || result.stderr)}`
          : `exit ${result.code}: ${shortenForTimeline(result.stderr || result.stdout)}`;
      return {
        ok: true,
        value: {
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        timelineSummary: summary,
      };
    },
  });
}
