import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import {
  isRepeatCaptureBlocked,
  rememberCaptureCursorBlock,
} from "@/agent/tools/uiAutomationState";
import { createEventId } from "@/agent/types";

const REPEAT_CAPTURE_ERROR =
  "Blocked: you already have a screenshot for this view. Read the attached image, pick the icon's block (NOT cursorBlockX/Y), call pointer_move, then pointer_click. Only capture again after the screen changes.";

export function createDisplayCaptureTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
    description:
      "Last resort: capture the primary display as PNG for vision (Actuate hides itself briefly while grabbing pixels). Use only when terminal_run and workspace tools cannot answer and the task requires visible pixels (UI layout, app windows, pointer coordinates). Do not use to read terminal text, file listings, or other output a command can print. Do not call twice for the same unchanged view in one task.",
    inputSchema: zodSchema(z.object({ label: z.string().optional() })),
    nativeGate: "displayCapture",
    preflight: () => {
      if (isRepeatCaptureBlocked(ctx.uiAutomation)) {
        return { ok: false, error: REPEAT_CAPTURE_ERROR };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: "Capture primary display",
      rationale: "Vision step requested by the model.",
      details: input.label ?? "keyframe",
    }),
    deniedError: "User denied screen capture.",
    describe: (input) => input.label ?? "screenshot",
    execute: async (input, _executeCtx, native) => {
      const capture = await native.capturePrimaryDisplayPngBase64();
      rememberCaptureCursorBlock(ctx.uiAutomation, capture.cursorBlockX, capture.cursorBlockY);
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

      const cursorBlock =
        capture.cursorBlockX !== null && capture.cursorBlockY !== null
          ? `(${capture.cursorBlockX}, ${capture.cursorBlockY})`
          : "unknown";

      return {
        ok: true,
        value: {
          bytes: capture.pngBase64.length,
          imageWidth: capture.imageWidth,
          imageHeight: capture.imageHeight,
          scaleFactor: capture.scaleFactor,
          blockColumns: capture.blockColumns,
          blockRows: capture.blockRows,
          cursorBlockX: capture.cursorBlockX,
          cursorBlockY: capture.cursorBlockY,
          nextStep:
            "Find the target icon in the image. pointer_move to that icon's blockX/blockY (NOT cursorBlockX/Y), then pointer_click with clickCount 2 if opening a desktop icon.",
          cursorBlockNote: `Mouse is currently at block ${cursorBlock} — do not use these numbers as the move target.`,
        },
        timelineSummary: `Captured ${capture.imageWidth}x${capture.imageHeight} (${capture.blockColumns}×${capture.blockRows} blocks). ${cursorBlock !== "unknown" ? `Cursor at ${cursorBlock} (not the target). ` : ""}Next: pick the icon block from the image, pointer_move, pointer_click.`,
      };
    },
  });
}
