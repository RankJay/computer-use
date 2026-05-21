import { tool, zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { gateNativeTool } from "@/agent/host/nativeToolGate";
import { terminalRunGuidanceForOs } from "@/agent/hostEnvironment";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import {
  abortable,
  isCancellationError,
  TOOL_CANCELLED_REASON,
  throwIfAborted,
} from "@/agent/tools/toolCancellation";
import {
  emitToolCancelled,
  emitToolCompleted,
  emitToolStarted,
  shortenForTimeline,
} from "@/agent/tools/toolTimeline";

let nextTerminalCancelToken = 1;

function createTerminalCancelToken(): number {
  const token = nextTerminalCancelToken;
  nextTerminalCancelToken = nextTerminalCancelToken === Number.MAX_SAFE_INTEGER ? 1 : token + 1;
  return token;
}

export function createTerminalRunTool(ctx: LiveAgentToolContext) {
  const hostShellHint = terminalRunGuidanceForOs(ctx.hostOs);
  return tool({
    description: `Run a terminal command (subprocess). Prefer short, non-interactive commands. Use for absolute paths outside the workspace (file tools are workspace-relative only). ${hostShellHint}`,
    inputSchema: zodSchema(
      z.object({
        program: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().nullable().optional(),
      }),
    ),
    execute: async (input) => {
      const command = `${input.program} ${input.args.join(" ")}`.trim();
      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, {
          summary: shortenForTimeline(command, 120),
          rationale: "The model requested a local shell command.",
          details: `program: ${input.program}\nargs: ${JSON.stringify(input.args)}\ncwd: ${input.cwd ?? "(default)"}\n\ncommand:\n${command}`,
        }),
      );
      if (!permitted) {
        return { ok: false as const, error: "User denied permission for terminal execution." };
      }
      throwIfAborted(ctx.signal);
      await emitToolStarted(
        ctx,
        AGENT_TOOL_NAMES.TERMINAL_RUN,
        shortenForTimeline(`${input.program} ${input.args.join(" ")}`),
      );
      const nativeGate = gateNativeTool(ctx.native, "terminal");
      if (!nativeGate.ok) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }
      const cancelToken = createTerminalCancelToken();
      try {
        const result = await abortable(
          ctx.signal,
          nativeGate.native.runCommand({
            program: input.program,
            args: input.args,
            cwd: input.cwd ?? ctx.workspaceRoot,
            cancelToken,
          }),
          () => nativeGate.native.cancelRunCommand(cancelToken),
        );
        const summary =
          result.code === 0
            ? `exit 0: ${shortenForTimeline(result.stdout || result.stderr)}`
            : `exit ${result.code}: ${shortenForTimeline(result.stderr || result.stdout)}`;
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, summary);
        return {
          ok: true as const,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, `Error: ${message}`);
        return { ok: false as const, error: message };
      }
    },
  });
}
