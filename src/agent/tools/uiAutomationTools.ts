import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";
import { focusTypeAttemptKey, pointerDeltaFromTarget, pointerMoveWasEffective, clearPendingCapture, isCursorBlockTarget } from "@/agent/tools/uiAutomationState";

const CURSOR_BLOCK_TARGET_ERROR =
  "That block is where the mouse already is (cursorBlock from the screenshot). Pick the block containing the target icon instead — desktop icons are usually top-left (low blockX and blockY, e.g. 1–2).";

async function resetStalePointerCancel(native: AgentNativeBridge): Promise<void> {
  await native.resetPointerAutomationCancel();
}

function formatPointerEvidence(
  targetBlockX: number,
  targetBlockY: number,
  cursorBlockX: number | null,
  cursorBlockY: number | null,
): string {
  const { deltaX, deltaY } = pointerDeltaFromTarget(
    targetBlockX,
    targetBlockY,
    cursorBlockX,
    cursorBlockY,
  );
  if (deltaX === null || deltaY === null) {
    return "Cursor block unknown after move.";
  }
  return `Cursor at block (${cursorBlockX}, ${cursorBlockY}); delta from target (${deltaX}, ${deltaY}).`;
}

/** 1-based pink block index along an axis (1 = first block from that edge). */
const blockIndexSchema = z.number().int().min(1);

export function createPointerMoveTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.POINTER_MOVE,
    description:
      "Move the mouse to a pink grid block on the latest display_capture image. Return blockX and blockY for the target icon — never cursorBlockX/Y from the capture result. Each pink block is 160×160 px. Yellow labels on top show blockX; on the left show blockY (both 1-based from top-left).",
    inputSchema: zodSchema(
      z.object({
        blockX: blockIndexSchema,
        blockY: blockIndexSchema,
      }),
    ),
    nativeGate: "uiAutomation",
    preflight: (input) => {
      if (isCursorBlockTarget(ctx.uiAutomation, input.blockX, input.blockY)) {
        return { ok: false, error: CURSOR_BLOCK_TARGET_ERROR };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: `Move pointer to block (${input.blockX}, ${input.blockY})`,
      rationale: "UI automation requested by the model.",
      details: `blockX=${input.blockX} blockY=${input.blockY}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `blk(${input.blockX},${input.blockY})`,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      const move = await native.pointerMoveTo(input.blockX, input.blockY);
      const deltas = pointerDeltaFromTarget(
        input.blockX,
        input.blockY,
        move.cursorBlockX,
        move.cursorBlockY,
      );
      if (pointerMoveWasEffective(deltas.deltaX, deltas.deltaY)) {
        clearPendingCapture(ctx.uiAutomation);
      }
      const evidence = formatPointerEvidence(
        input.blockX,
        input.blockY,
        move.cursorBlockX,
        move.cursorBlockY,
      );
      const noOp =
        deltas.deltaX === 0 && deltas.deltaY === 0
          ? " No movement — target equals current cursor block."
          : "";
      return {
        ok: true,
        value: {
          targetBlockX: input.blockX,
          targetBlockY: input.blockY,
          cursorBlockX: move.cursorBlockX,
          cursorBlockY: move.cursorBlockY,
          ...deltas,
          noOp: deltas.deltaX === 0 && deltas.deltaY === 0,
        },
        timelineSummary: `${evidence}${noOp}`,
      };
    },
  });
}

export function createPointerClickTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.POINTER_CLICK,
    description:
      "Click a mouse button at the current cursor position. Use clickCount 2 to double-click (e.g. open desktop icons).",
    inputSchema: zodSchema(
      z.object({
        button: z.enum(["left", "right", "middle"]),
        clickCount: z.number().int().min(1).max(2).optional(),
      }),
    ),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: input.clickCount === 2 ? `${input.button} double-click` : `${input.button} click`,
      rationale: "UI automation requested by the model.",
      details: `button=${input.button} clickCount=${input.clickCount ?? 1}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) =>
      input.clickCount === 2 ? `${input.button}×2` : input.button,
    execute: async (input, executeCtx, native) => {
      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);
      await native.pointerClick(input.button, input.clickCount);
      clearPendingCapture(ctx.uiAutomation);
      return {
        ok: true,
        value: { clickCount: input.clickCount ?? 1 },
        timelineSummary: input.clickCount === 2 ? "Double-clicked." : "Clicked.",
      };
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
      "Move to a grid block, click to focus it, type literal text, and optionally press Enter. Use blockX/blockY (1-based) from the latest display_capture grid — same as pointer_move.",
    inputSchema: zodSchema(
      z.object({
        blockX: blockIndexSchema,
        blockY: blockIndexSchema,
        text: z.string(),
        submit: z.boolean().optional(),
      }),
    ),
    nativeGate: "uiAutomation",
    permission: (input) => ({
      summary: `Focus block (${input.blockX}, ${input.blockY}) and type ${input.text.length} chars`,
      rationale: "UI text-entry automation requested by the model.",
      details: shortenForTimeline(input.text, 200),
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `blk(${input.blockX},${input.blockY}) ${input.text.length} chars`,
    execute: async (input, executeCtx, native) => {
      const attemptKey = focusTypeAttemptKey(input);
      const baseValue = {
        skipped: false as boolean,
        reason: null as string | null,
        targetBlockX: input.blockX,
        targetBlockY: input.blockY,
        cursorBlockX: null as number | null,
        cursorBlockY: null as number | null,
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
          timelineSummary: "Already entered this text at this block in this run.",
        };
      }

      executeCtx.setNativeCancel(native.cancelPointerAutomation);
      await resetStalePointerCancel(native);

      clearPendingCapture(ctx.uiAutomation);
      const move = await native.pointerMoveTo(input.blockX, input.blockY);
      await native.pointerClick("left");
      await native.typeText(input.text);
      if (input.submit === true) {
        await native.keyTap("enter");
      }

      ctx.uiAutomation.completedFocusTypeAttempts.add(attemptKey);

      const deltas = pointerDeltaFromTarget(
        input.blockX,
        input.blockY,
        move.cursorBlockX,
        move.cursorBlockY,
      );
      const evidence = formatPointerEvidence(
        input.blockX,
        input.blockY,
        move.cursorBlockX,
        move.cursorBlockY,
      );

      return {
        ok: true,
        value: {
          ...baseValue,
          cursorBlockX: move.cursorBlockX,
          cursorBlockY: move.cursorBlockY,
          ...deltas,
        },
        timelineSummary: `Focused and typed ${input.text.length} chars. ${evidence}`,
      };
    },
  });
}
