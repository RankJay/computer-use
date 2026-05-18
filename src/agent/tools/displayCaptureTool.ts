import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { createEventId } from "@/agent/types";
import { emitToolCompleted, emitToolStarted } from "@/agent/tools/toolTimeline";

export function createDisplayCaptureTool(ctx: LiveAgentToolContext) {
  return tool({
    description: "Capture the primary display as PNG for vision. Call when you need fresh pixels.",
    inputSchema: zodSchema(z.object({ label: z.string().optional() })),
    execute: async (input) => {
      const permitted = await requestToolPermission(ctx, AGENT_TOOL_NAMES.DISPLAY_CAPTURE, {
        summary: "Capture primary display",
        rationale: "Vision step requested by the model.",
        details: input.label ?? "keyframe",
      });
      if (!permitted) {
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
}
