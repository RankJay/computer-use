import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";

export function createPointerMoveTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.POINTER_MOVE,
    description: "Move the mouse pointer to absolute screen coordinates.",
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
      await native.pointerMoveTo(input.x, input.y);
      return { ok: true, value: {}, timelineSummary: "Moved." };
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
      await native.keyTap(input.key);
      return { ok: true, value: {}, timelineSummary: "Sent." };
    },
  });
}
