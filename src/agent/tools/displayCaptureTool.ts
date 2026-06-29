import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { createEventId } from "@/agent/types";

export function createDisplayCaptureTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
    description:
      "Last resort: capture the primary display as PNG for vision (Actuate hides itself briefly while grabbing pixels). Use only when terminal_run and workspace tools cannot answer and the task requires visible pixels (UI layout, app windows, pointer coordinates). Do not use to read terminal text, file listings, or other output a command can print. Do not call twice for the same unchanged view in one task.",
    inputSchema: zodSchema(z.object({ label: z.string().optional() })),
    nativeGate: "displayCapture",
    permission: (input) => ({
      summary: "Capture primary display",
      rationale: "Vision step requested by the model.",
      details: input.label ?? "keyframe",
    }),
    deniedError: "User denied screen capture.",
    describe: (input) => input.label ?? "screenshot",
    execute: async (input, _executeCtx, native) => {
      const capture = await native.capturePrimaryDisplayPngBase64();
      ctx.vision.latestCapture = capture;
      const ev = {
        id: createEventId(),
        at: Date.now(),
        taskId: ctx.taskId,
        type: "screenshot.keyframe" as const,
        label: input.label ?? "model capture",
        imageBase64: capture.pngBase64,
      };
      ctx.emit(ev);
      await ctx.appendStructuredLog(ev);
      return {
        ok: true,
        value: {
          bytes: capture.pngBase64.length,
          imageWidth: capture.imageWidth,
          imageHeight: capture.imageHeight,
          scaleFactor: capture.scaleFactor,
        },
        timelineSummary: `Captured ${capture.imageWidth}x${capture.imageHeight} image (${capture.pngBase64.length} base64 chars, scale ${capture.scaleFactor}).`,
      };
    },
  });
}
