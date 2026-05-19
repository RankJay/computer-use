import { tool, zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { emitToolCompleted, emitToolStarted, shortenForTimeline } from "@/agent/tools/toolTimeline";

export function createWorkspaceInspectTool(ctx: LiveAgentToolContext) {
  return tool({
    description:
      "List immediate children (file and directory names) in a workspace-relative directory only (under Settings workspace root). Use an empty relativeDir for the workspace root. Non-recursive. Does not accept drive letters or absolute paths—use terminal_run for those.",
    inputSchema: zodSchema(
      z.object({
        relativeDir: z.string().optional().default(""),
      }),
    ),
    execute: async (input) => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false as const, error: "Workspace root is not set." };
      }
      const rel = input.relativeDir ?? "";
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, {
        summary: `List ${rel.length > 0 ? rel : "."}`,
        rationale: "The model requested a read-only directory listing.",
        details: `workspace: ${root}\nrelativeDir: ${rel || "(root)"}`,
      });
      if (!permitted) {
        return { ok: false as const, error: "User denied workspace listing." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, rel || ".");
      try {
        const entries = await ctx.workspaceFiles.listDirectory(root, rel);
        const summary = `${entries.length} entr${entries.length === 1 ? "y" : "ies"}: ${entries.slice(0, 24).join(", ")}${entries.length > 24 ? "…" : ""}`;
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, summary);
        return { ok: true as const, entries };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, message);
        return { ok: false as const, error: message };
      }
    },
  });
}

export function createReadFileTool(ctx: LiveAgentToolContext) {
  return tool({
    description:
      "Read a UTF-8 file relative to the configured workspace root only. Not for arbitrary absolute paths—use terminal_run to read elsewhere.",
    inputSchema: zodSchema(z.object({ relativePath: z.string() })),
    execute: async (input) => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false as const, error: "Workspace root is not set." };
      }
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.FILE_READ, {
        summary: `Read ${input.relativePath}`,
        rationale: "The model requested file contents.",
        details: `workspace: ${root}\nrelative: ${input.relativePath}`,
      });
      if (!permitted) {
        return { ok: false as const, error: "User denied file read." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.FILE_READ, input.relativePath);
      try {
        const text = await ctx.workspaceFiles.readFile(root, input.relativePath);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_READ, shortenForTimeline(text));
        return { ok: true as const, content: text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_READ, message);
        return { ok: false as const, error: message };
      }
    },
  });
}

export function createWriteFileTool(ctx: LiveAgentToolContext) {
  return tool({
    description: "Write UTF-8 text to a workspace-relative path.",
    inputSchema: zodSchema(
      z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
    ),
    execute: async (input) => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false as const, error: "Workspace root is not set." };
      }
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.FILE_WRITE, {
        summary: `Write ${input.relativePath}`,
        rationale: "The model will create or overwrite a workspace file.",
        details: `workspace: ${root}\nrelative: ${input.relativePath}\nbytes: ${input.content.length}`,
      });
      if (!permitted) {
        return { ok: false as const, error: "User denied file write." };
      }
      await emitToolStarted(
        ctx,
        AGENT_TOOL_NAMES.FILE_WRITE,
        `${input.relativePath} (${input.content.length} bytes)`,
      );
      try {
        const path = await ctx.workspaceFiles.writeFile(root, input.relativePath, input.content);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_WRITE, `Wrote ${path}`);
        return { ok: true as const, path };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_WRITE, message);
        return { ok: false as const, error: message };
      }
    },
  });
}
