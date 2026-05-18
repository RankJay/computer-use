import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { emitToolCompleted, emitToolStarted, shortenForTimeline } from "@/agent/tools/toolTimeline";

export function createPointerMoveTool(ctx: LiveAgentToolContext) {
  return tool({
    description: "Move the mouse pointer to absolute screen coordinates.",
    inputSchema: zodSchema(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
      }),
    ),
    execute: async (input) => {
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, {
        summary: `Move pointer to (${input.x}, ${input.y})`,
        rationale: "UI automation requested by the model.",
        details: `x=${input.x} y=${input.y}`,
      });
      if (!permitted) {
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
}

export function createPointerClickTool(ctx: LiveAgentToolContext) {
  return tool({
    description: "Click a mouse button at the current cursor position.",
    inputSchema: zodSchema(z.object({ button: z.enum(["left", "right", "middle"]) })),
    execute: async (input) => {
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, {
        summary: `${input.button} click`,
        rationale: "UI automation requested by the model.",
        details: `button=${input.button}`,
      });
      if (!permitted) {
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
}

export function createTypeTextTool(ctx: LiveAgentToolContext) {
  return tool({
    description: "Type Unicode text via OS keyboard simulation (focused app).",
    inputSchema: zodSchema(z.object({ text: z.string() })),
    execute: async (input) => {
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, {
        summary: `Type ${input.text.length} characters`,
        rationale: "Keyboard automation requested by the model.",
        details: shortenForTimeline(input.text, 200),
      });
      if (!permitted) {
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
}
