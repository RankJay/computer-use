import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { terminalRunGuidanceForOs } from "@/agent/hostEnvironment";
import { requestToolPermission } from "@/agent/permissionOrchestrator";
import { AGENT_TOOL_NAMES, type AgentToolName } from "@/agent/toolContract";
import { createEventId } from "@/agent/types";
import {
  readWorkspaceFile,
  listWorkspaceDirectory,
  writeWorkspaceFile,
} from "@/agent/workspaceAdapter";

function trimText(text: string, max = 400): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function emitToolStarted(
  ctx: LiveAgentToolContext,
  toolName: AgentToolName,
  inputSummary: string,
): Promise<void> {
  const ev = {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "tool.started" as const,
    toolName,
    inputSummary,
  };
  ctx.emit(ev);
  await ctx.appendStructuredLog(ev);
}

async function emitToolCompleted(
  ctx: LiveAgentToolContext,
  toolName: AgentToolName,
  outputSummary: string,
): Promise<void> {
  const ev = {
    id: createEventId(),
    at: Date.now(),
    taskId: ctx.taskId,
    type: "tool.completed" as const,
    toolName,
    outputSummary,
  };
  ctx.emit(ev);
  await ctx.appendStructuredLog(ev);
}

export function createActuateTools(ctx: LiveAgentToolContext) {
  const terminalIntro = terminalRunGuidanceForOs(ctx.hostOs);
  const terminal_run = tool({
    description: `Run a terminal command (subprocess). Prefer short, non-interactive commands. Use for absolute paths outside the workspace (file tools are workspace-relative only). ${terminalIntro}`,
    inputSchema: zodSchema(
      z.object({
        program: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().nullable().optional(),
      }),
    ),
    execute: async (input) => {
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, {
        summary: `${input.program} ${input.args.join(" ")}`.trim(),
        rationale: "The model requested a local shell command.",
        details: `program: ${input.program}\nargs: ${JSON.stringify(input.args)}\ncwd: ${input.cwd ?? "(default)"}`,
      });
      if (!ok) {
        return { ok: false as const, error: "User denied permission for terminal execution." };
      }
      await emitToolStarted(
        ctx,
        AGENT_TOOL_NAMES.TERMINAL_RUN,
        trimText(`${input.program} ${input.args.join(" ")}`),
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
        const out = await ctx.native.runCommand({
          program: input.program,
          args: input.args,
          cwd: input.cwd ?? ctx.workspaceRoot,
        });
        const summary =
          out.code === 0
            ? `exit 0: ${trimText(out.stdout || out.stderr)}`
            : `exit ${out.code}: ${trimText(out.stderr || out.stdout)}`;
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, summary);
        return { ok: true as const, code: out.code, stdout: out.stdout, stderr: out.stderr };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TERMINAL_RUN, `Error: ${message}`);
        return { ok: false as const, error: message };
      }
    },
  });

  const display_capture = tool({
    description: "Capture the primary display as PNG for vision. Call when you need fresh pixels.",
    inputSchema: zodSchema(z.object({ label: z.string().optional() })),
    execute: async (input) => {
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.DISPLAY_CAPTURE, {
        summary: "Capture primary display",
        rationale: "Vision step requested by the model.",
        details: input.label ?? "keyframe",
      });
      if (!ok) {
        return { ok: false as const, error: "User denied screen capture." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.DISPLAY_CAPTURE, input.label ?? "screenshot");
      if (!ctx.native) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.DISPLAY_CAPTURE, "No native bridge.");
        return { ok: false as const, error: "Capture requires the Tauri desktop app." };
      }
      try {
        const b64 = await ctx.native.capturePrimaryDisplayPngBase64();
        ctx.vision.latestPng = b64;
        const ev = {
          id: createEventId(),
          at: Date.now(),
          taskId: ctx.taskId,
          type: "screenshot.keyframe" as const,
          label: input.label ?? "model capture",
          imageBase64: b64,
        };
        ctx.emit(ev);
        await ctx.appendStructuredLog(ev);
        await emitToolCompleted(
          ctx,
          AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
          `Captured ${b64.length} base64 chars.`,
        );
        return { ok: true as const, bytes: b64.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.DISPLAY_CAPTURE, message);
        return { ok: false as const, error: message };
      }
    },
  });

  const workspace_inspect = tool({
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
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, {
        summary: `List ${rel.length > 0 ? rel : "."}`,
        rationale: "The model requested a read-only directory listing.",
        details: `workspace: ${root}\nrelativeDir: ${rel || "(root)"}`,
      });
      if (!ok) {
        return { ok: false as const, error: "User denied workspace listing." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.WORKSPACE_INSPECT, rel || ".");
      try {
        const entries = await listWorkspaceDirectory(root, rel);
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

  const read_file = tool({
    description:
      "Read a UTF-8 file relative to the configured workspace root only. Not for arbitrary absolute paths—use terminal_run to read elsewhere.",
    inputSchema: zodSchema(z.object({ relativePath: z.string() })),
    execute: async (input) => {
      const root = ctx.workspaceRoot;
      if (!root) {
        return { ok: false as const, error: "Workspace root is not set." };
      }
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.FILE_READ, {
        summary: `Read ${input.relativePath}`,
        rationale: "The model requested file contents.",
        details: `workspace: ${root}\nrelative: ${input.relativePath}`,
      });
      if (!ok) {
        return { ok: false as const, error: "User denied file read." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.FILE_READ, input.relativePath);
      try {
        const text = await readWorkspaceFile(root, input.relativePath);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_READ, trimText(text));
        return { ok: true as const, content: text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_READ, message);
        return { ok: false as const, error: message };
      }
    },
  });

  const write_file = tool({
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
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.FILE_WRITE, {
        summary: `Write ${input.relativePath}`,
        rationale: "The model will create or overwrite a workspace file.",
        details: `workspace: ${root}\nrelative: ${input.relativePath}\nbytes: ${input.content.length}`,
      });
      if (!ok) {
        return { ok: false as const, error: "User denied file write." };
      }
      await emitToolStarted(
        ctx,
        AGENT_TOOL_NAMES.FILE_WRITE,
        `${input.relativePath} (${input.content.length} bytes)`,
      );
      try {
        const path = await writeWorkspaceFile(root, input.relativePath, input.content);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_WRITE, `Wrote ${path}`);
        return { ok: true as const, path };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.FILE_WRITE, message);
        return { ok: false as const, error: message };
      }
    },
  });

  const pointer_move = tool({
    description: "Move the mouse pointer to absolute screen coordinates.",
    inputSchema: zodSchema(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
      }),
    ),
    execute: async (input) => {
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, {
        summary: `Move pointer to (${input.x}, ${input.y})`,
        rationale: "UI automation requested by the model.",
        details: `x=${input.x} y=${input.y}`,
      });
      if (!ok) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, `(${input.x},${input.y})`);
      if (!ctx.native) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, "No native bridge.");
        return { ok: false as const, error: "Requires Tauri." };
      }
      try {
        await ctx.native.pointerMoveTo(input.x, input.y);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, "Moved.");
        return { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, message);
        return { ok: false as const, error: message };
      }
    },
  });

  const pointer_click = tool({
    description: "Click a mouse button at the current cursor position.",
    inputSchema: zodSchema(z.object({ button: z.enum(["left", "right", "middle"]) })),
    execute: async (input) => {
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, {
        summary: `${input.button} click`,
        rationale: "UI automation requested by the model.",
        details: `button=${input.button}`,
      });
      if (!ok) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, input.button);
      if (!ctx.native) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, "No native bridge.");
        return { ok: false as const, error: "Requires Tauri." };
      }
      try {
        await ctx.native.pointerClick(input.button);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, "Clicked.");
        return { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, message);
        return { ok: false as const, error: message };
      }
    },
  });

  const type_text = tool({
    description: "Type Unicode text via OS keyboard simulation (focused app).",
    inputSchema: zodSchema(z.object({ text: z.string() })),
    execute: async (input) => {
      const ok = await requestToolPermission(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, {
        summary: `Type ${input.text.length} characters`,
        rationale: "Keyboard automation requested by the model.",
        details: trimText(input.text, 200),
      });
      if (!ok) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, `${input.text.length} chars`);
      if (!ctx.native) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, "No native bridge.");
        return { ok: false as const, error: "Requires Tauri." };
      }
      try {
        await ctx.native.typeText(input.text);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, "Typed.");
        return { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, message);
        return { ok: false as const, error: message };
      }
    },
  });

  return {
    terminal_run,
    workspace_inspect,
    display_capture,
    read_file,
    write_file,
    pointer_move,
    pointer_click,
    type_text,
  };
}

export type ActuateToolSet = ReturnType<typeof createActuateTools>;
