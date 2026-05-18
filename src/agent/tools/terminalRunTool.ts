import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { terminalRunGuidanceForOs } from "@/agent/hostEnvironment";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { emitToolCompleted, emitToolStarted, shortenForTimeline } from "@/agent/tools/toolTimeline";

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
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, {
        summary: `${input.program} ${input.args.join(" ")}`.trim(),
        rationale: "The model requested a local shell command.",
        details: `program: ${input.program}\nargs: ${JSON.stringify(input.args)}\ncwd: ${input.cwd ?? "(default)"}`,
      });
      if (!permitted) {
        return { ok: false as const, error: "User denied permission for terminal execution." };
      }
      await emitToolStarted(
        ctx,
        AGENT_TOOL_NAMES.TERMINAL_RUN,
        shortenForTimeline(`${input.program} ${input.args.join(" ")}`),
      );
      if (!ctx.native) {
        await emitToolCompleted(
          ctx,
          AGENT_TOOL_NAMES.TERMINAL_RUN,
          "No native bridge (web build).",
        );
        return { ok: false as const, error: "Terminal tools require the Tauri desktop app." };
      }
      try {
        const result = await ctx.native.runCommand({
          program: input.program,
          args: input.args,
          cwd: input.cwd ?? ctx.workspaceRoot,
        });
        const summary =
          result.code === 0
            ? `exit 0: ${shortenForTimeline(result.stdout || result.stderr)}`
            : `exit ${result.code}: ${shortenForTimeline(result.stderr || result.stdout)}`;
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, summary);
        return {
          ok: true as const,
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, `Error: ${message}`);
        return { ok: false as const, error: message };
      }
    },
  });
}
