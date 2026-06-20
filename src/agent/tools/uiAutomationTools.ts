import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";
import { focusTypeAttemptKey, pointerDeltaFromTarget } from "@/agent/tools/uiAutomationState";

async function resetStalePointerCancel(native: AgentNativeBridge): Promise<void> {
  await native.resetPointerAutomationCancel();
}

function formatPointerEvidence(
  targetX: number,
  targetY: number,
  cursorImageX: number | null,
  cursorImageY: number | null,
): string {
  const { deltaX, deltaY } = pointerDeltaFromTarget(targetX, targetY, cursorImageX, cursorImageY);
  if (deltaX === null || deltaY === null) {
    return "Cursor position unknown after move.";
  }
  return `Cursor at (${cursorImageX}, ${cursorImageY}); delta from target (${deltaX}, ${deltaY}).`;
}

export function createPointerMoveTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.POINTER_MOVE,
    description:
      "Move the mouse pointer to coordinates measured in pixels from the top-left of the latest display_capture image. Choose the center of the intended target, not its edge. Returns the cursor position after the move when available.",
    inputSchema: zodSchema(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
      }),
    ),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Move pointer to (${input.x}, ${input.y})`,
      rationale: "UI automation requested by the model.",
      details: `x=${input.x} y=${input.y}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `(${input.x},${input.y})`,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      const move = await native.pointerMoveTo(input.x, input.y);
      const evidence = formatPointerEvidence(
        input.x,
        input.y,
        move.cursorImageX,
        move.cursorImageY,
      );
      return {
        ok: true,
        value: {
          targetX: input.x,
          targetY: input.y,
          cursorImageX: move.cursorImageX,
          cursorImageY: move.cursorImageY,
          ...pointerDeltaFromTarget(input.x, input.y, move.cursorImageX, move.cursorImageY),
        },
        timelineSummary: evidence,
      };
    },
  });
}

export function createPointerClickTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.POINTER_CLICK,
    description: "Click a mouse button at the current cursor position.",
    inputSchema: zodSchema(z.object({ button: z.enum(["left", "right", "middle"]) })),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `${input.button} click`,
      rationale: "UI automation requested by the model.",
      details: `button=${input.button}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => input.button,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);
      await native.pointerClick(input.button);
      return { ok: true, value: {}, timelineSummary: "Clicked." };
    },
  });
}

export function createTypeTextTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.TYPE_TEXT,
    description: "Type Unicode text via OS keyboard simulation (focused app).",
    inputSchema: zodSchema(z.object({ text: z.string() })),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Type ${input.text.length} characters`,
      rationale: "Keyboard automation requested by the model.",
      details: shortenForTimeline(input.text, 200),
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `${input.text.length} chars`,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);
      await native.typeText(input.text);
      return { ok: true, value: {}, timelineSummary: "Typed." };
    },
  });
}

const keyTapLogicalKeySchema = z.enum(["enter", "tab", "escape", "backspace"]);

export function createKeyTapTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.KEY_TAP,
    description:
      "Press a single logical key in the focused application (OS keyboard simulation). Use key enter to submit prompts, send chat, or dialog OK; use escape to dismiss; tab to move focus.",
    inputSchema: zodSchema(
      z.object({
        key: keyTapLogicalKeySchema,
      }),
    ),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Press ${input.key}`,
      rationale: "Keyboard automation requested by the model.",
      details: input.key,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => input.key,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);
      await native.keyTap(input.key);
      return { ok: true, value: {}, timelineSummary: "Sent." };
    },
  });
}

export function createUiFocusTypeTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.UI_FOCUS_TYPE,
    description:
      "Move to a visible control, click to focus it, type literal text, and optionally press Enter. Prefer this over separate pointer_move, pointer_click, and type_text when entering text into a known on-screen input from the latest screenshot.",
    inputSchema: zodSchema(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        text: z.string(),
        submit: z.boolean().optional(),
      }),
    ),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Focus (${input.x}, ${input.y}) and type ${input.text.length} chars`,
      rationale: "UI text-entry automation requested by the model.",
      details: shortenForTimeline(input.text, 200),
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `(${input.x},${input.y}) ${input.text.length} chars`,
    execute: async (input, executeCtx, native) => {
      const attemptKey = focusTypeAttemptKey(input);
      const baseValue = {
        skipped: false as boolean,
        reason: null as string | null,
        targetX: input.x,
        targetY: input.y,
        cursorImageX: null as number | null,
        cursorImageY: null as number | null,
        deltaX: null as number | null,
        deltaY: null as number | null,
        textLength: input.text.length,
        submitted: input.submit === true,
      };

      if (ctx.uiAutomation.completedFocusTypeAttempts.has(attemptKey)) {
        return {
          ok: true,
          value: {
            ...baseValue,
            skipped: true,
            reason: "already_attempted",
          },
          timelineSummary: "Already entered this text at these coordinates in this run.",
        };
      }

      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);

      const move = await native.pointerMoveTo(input.x, input.y);
      await native.pointerClick("left");
      await native.typeText(input.text);
      if (input.submit === true) {
        await native.keyTap("enter");
      }

      ctx.uiAutomation.completedFocusTypeAttempts.add(attemptKey);

      const deltas = pointerDeltaFromTarget(input.x, input.y, move.cursorImageX, move.cursorImageY);
      const evidence = formatPointerEvidence(
        input.x,
        input.y,
        move.cursorImageX,
        move.cursorImageY,
      );

      return {
        ok: true,
        value: {
          ...baseValue,
          cursorImageX: move.cursorImageX,
          cursorImageY: move.cursorImageY,
          ...deltas,
        },
        timelineSummary: `Focused and typed ${input.text.length} chars. ${evidence}`,
      };
    },
  });
}
