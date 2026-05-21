import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";

function workspaceRootOrThrow(ctx: LiveAgentToolContext): string {
  const root = ctx.workspaceRoot;
  if (!root) {
    throw new Error("Workspace root is not set.");
  }
  return root;
}

export function createWorkspaceInspectTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
    description:
      "List immediate children (file and directory names) in a workspace-relative directory only (under Settings workspace root). Use an empty relativeDir for the workspace root. Non-recursive. Does not accept drive letters or absolute paths—use terminal_run for those.",
    inputSchema: zodSchema(
      z.object({
        relativeDir: z.string().optional().default(""),
      }),
    ),
    nativeGate: "none",
    preflight: () => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false, error: "Workspace root is not set." };
      }
      return { ok: true };
    },
    permission: (input) => {
      const rel = input.relativeDir ?? "";
      return {
        summary: `List ${rel.length > 0 ? rel : "."}`,
        rationale: "The model requested a read-only directory listing.",
        details: `workspace: ${ctx.workspaceRoot}\nrelativeDir: ${rel || "(root)"}`,
      };
    },
    deniedError: "User denied workspace listing.",
    describe: (input) => input.relativeDir || ".",
    execute: async (input) => {
      const entries = await ctx.workspaceFiles.listDirectory(
        workspaceRootOrThrow(ctx),
        input.relativeDir ?? "",
      );
      const summary = `${entries.length} entr${entries.length === 1 ? "y" : "ies"}: ${entries.slice(0, 24).join(", ")}${entries.length > 24 ? "…" : ""}`;
      return { ok: true, value: { entries }, timelineSummary: summary };
    },
  });
}

export function createReadFileTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.FILE_READ,
    description:
      "Read a UTF-8 file relative to the configured workspace root only. Not for arbitrary absolute paths—use terminal_run to read elsewhere.",
    inputSchema: zodSchema(z.object({ relativePath: z.string() })),
    nativeGate: "none",
    preflight: () => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false, error: "Workspace root is not set." };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: `Read ${input.relativePath}`,
      rationale: "The model requested file contents.",
      details: `workspace: ${ctx.workspaceRoot}\nrelative: ${input.relativePath}`,
    }),
    deniedError: "User denied file read.",
    describe: (input) => input.relativePath,
    execute: async (input) => {
      const text = await ctx.workspaceFiles.readFile(workspaceRootOrThrow(ctx), input.relativePath);
      return { ok: true, value: { content: text }, timelineSummary: shortenForTimeline(text) };
    },
  });
}

export function createWriteFileTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.FILE_WRITE,
    description: "Write UTF-8 text to a workspace-relative path.",
    inputSchema: zodSchema(
      z.object({
        relativePath: z.string(),
        content: z.string(),
      }),
    ),
    nativeGate: "none",
    preflight: () => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false, error: "Workspace root is not set." };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: `Write ${input.relativePath}`,
      rationale: "The model will create or overwrite a workspace file.",
      details: `workspace: ${ctx.workspaceRoot}\nrelative: ${input.relativePath}\nbytes: ${input.content.length}`,
    }),
    deniedError: "User denied file write.",
    describe: (input) => `${input.relativePath} (${input.content.length} bytes)`,
    execute: async (input) => {
      const path = await ctx.workspaceFiles.writeFile(
        workspaceRootOrThrow(ctx),
        input.relativePath,
        input.content,
      );
      return { ok: true, value: { path }, timelineSummary: `Wrote ${path}` };
    },
  });
}
