import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { applyFilePatches } from "@/agent/tools/filePatchLogic";
import { renameRelativePath } from "@/agent/tools/workspacePathUtils";

const transferOptionsSchema = {
  overwrite: z.boolean().optional().default(false),
};

const patchEditSchema = z.object({
  search: z.string().min(1),
  replace: z.string(),
  replaceAll: z.boolean().optional(),
});

function workspaceRootOrThrow(ctx: LiveAgentToolContext): string {
  const root = ctx.workspaceRoot;
  if (!root) {
    throw new Error("Workspace root is not set.");
  }
  return root;
}

export function createRenamePathTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.PATH_RENAME,
    description:
      "Rename a workspace-relative file or directory by changing its basename only. Prefer this over move_path when the item stays in the same folder.",
    inputSchema: zodSchema(
      z.object({
        relativePath: z.string(),
        newName: z.string().min(1),
        ...transferOptionsSchema,
      }),
    ),
    nativeGate: "none",
    preflight: (input) => {
      if (!ctx.workspaceRoot) {
        return { ok: false, error: "Workspace root is not set." };
      }
      try {
        renameRelativePath(input.relativePath, input.newName);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    permission: (input) => {
      const destination = renameRelativePath(input.relativePath, input.newName);
      return {
        summary: `Rename ${input.relativePath} to ${destination}`,
        rationale: "The model will rename a workspace path in place.",
        details: `workspace: ${ctx.workspaceRoot}\nsource: ${input.relativePath}\nnewName: ${input.newName}\noverwrite: ${input.overwrite ?? false}`,
      };
    },
    deniedError: "User denied path rename.",
    describe: (input) => `${input.relativePath} -> ${input.newName}`,
    execute: async (input) => {
      const destination = renameRelativePath(input.relativePath, input.newName);
      const path = await ctx.workspaceFiles.movePath(
        workspaceRootOrThrow(ctx),
        input.relativePath,
        destination,
        { overwrite: input.overwrite ?? false, createParents: false },
      );
      return {
        ok: true,
        value: { path, destinationRelativePath: destination },
        timelineSummary: `Renamed to ${path}`,
      };
    },
  });
}

export function createPatchFileTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.FILE_PATCH,
    description:
      "Apply structured search-and-replace edits to a UTF-8 workspace file without regenerating the whole file. Each edit must match exactly once unless replaceAll is true. Prefer this over write_file for small typo or copy fixes.",
    inputSchema: zodSchema(
      z.object({
        relativePath: z.string(),
        edits: z.array(patchEditSchema).min(1).max(32),
      }),
    ),
    nativeGate: "none",
    preflight: () => {
      if (!ctx.workspaceRoot) {
        return { ok: false, error: "Workspace root is not set." };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: `Patch ${input.relativePath} (${input.edits.length} edit${input.edits.length === 1 ? "" : "s"})`,
      rationale: "The model will apply structured text replacements to a workspace file.",
      details: `workspace: ${ctx.workspaceRoot}\nrelative: ${input.relativePath}\nedits: ${input.edits.length}`,
    }),
    deniedError: "User denied file patch.",
    describe: (input) => `${input.relativePath} (${input.edits.length})`,
    execute: async (input) => {
      const root = workspaceRootOrThrow(ctx);
      const before = await ctx.workspaceFiles.readFile(root, input.relativePath);
      const patched = applyFilePatches(before, input.edits);
      const path = await ctx.workspaceFiles.writeFile(root, input.relativePath, patched.content);
      return {
        ok: true,
        value: { path, applied: patched.applied },
        timelineSummary: `Patched ${input.relativePath} (${patched.applied} replacement${patched.applied === 1 ? "" : "s"})`,
      };
    },
  });
}
