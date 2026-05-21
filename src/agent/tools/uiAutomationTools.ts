import { tool, zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { gateNativeTool } from "@/agent/host/nativeToolGate";
import { requestToolPermission } from "@/agent/permissions/permissionOrchestrator";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import {
  abortable,
  isCancellationError,
  TOOL_CANCELLED_REASON,
  toolTimeoutFromNativeError,
  throwIfAborted,
  withToolTimeout,
} from "@/agent/tools/toolCancellation";
import {
  emitToolCancelled,
  emitToolCompleted,
  emitToolError,
  emitToolStarted,
  shortenForTimeline,
} from "@/agent/tools/toolTimeline";

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
      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, {
          summary: `Move pointer to (${input.x}, ${input.y})`,
          rationale: "UI automation requested by the model.",
          details: `x=${input.x} y=${input.y}`,
        }),
      );
      if (!permitted) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      throwIfAborted(ctx.signal);
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, `(${input.x},${input.y})`);
      const nativeGate = gateNativeTool(ctx.native, "uiAutomation");
      if (!nativeGate.ok) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }
      try {
        await withToolTimeout(
          AGENT_TOOL_NAMES.POINTER_MOVE,
          abortable(
            ctx.signal,
            nativeGate.native.pointerMoveTo(input.x, input.y),
            nativeGate.native.cancelPointerAutomation,
          ),
          nativeGate.native.cancelPointerAutomation,
        );
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, "Moved.");
        return { ok: true as const };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const timeoutError = toolTimeoutFromNativeError(err, AGENT_TOOL_NAMES.POINTER_MOVE);
        if (timeoutError !== null) {
          await emitToolError(ctx, AGENT_TOOL_NAMES.POINTER_MOVE, timeoutError.payload);
          return { ok: false as const, error: timeoutError.payload };
        }
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
      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, {
          summary: `${input.button} click`,
          rationale: "UI automation requested by the model.",
          details: `button=${input.button}`,
        }),
      );
      if (!permitted) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      throwIfAborted(ctx.signal);
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, input.button);
      const nativeGate = gateNativeTool(ctx.native, "uiAutomation");
      if (!nativeGate.ok) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }
      try {
        await withToolTimeout(
          AGENT_TOOL_NAMES.POINTER_CLICK,
          abortable(
            ctx.signal,
            nativeGate.native.pointerClick(input.button),
            nativeGate.native.cancelPointerAutomation,
          ),
          nativeGate.native.cancelPointerAutomation,
        );
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, "Clicked.");
        return { ok: true as const };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const timeoutError = toolTimeoutFromNativeError(err, AGENT_TOOL_NAMES.POINTER_CLICK);
        if (timeoutError !== null) {
          await emitToolError(ctx, AGENT_TOOL_NAMES.POINTER_CLICK, timeoutError.payload);
          return { ok: false as const, error: timeoutError.payload };
        }
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
      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, {
          summary: `Type ${input.text.length} characters`,
          rationale: "Keyboard automation requested by the model.",
          details: shortenForTimeline(input.text, 200),
        }),
      );
      if (!permitted) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      throwIfAborted(ctx.signal);
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, `${input.text.length} chars`);
      const nativeGate = gateNativeTool(ctx.native, "uiAutomation");
      if (!nativeGate.ok) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }
      try {
        await withToolTimeout(
          AGENT_TOOL_NAMES.TYPE_TEXT,
          abortable(
            ctx.signal,
            nativeGate.native.typeText(input.text),
            nativeGate.native.cancelPointerAutomation,
          ),
          nativeGate.native.cancelPointerAutomation,
        );
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, "Typed.");
        return { ok: true as const };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const timeoutError = toolTimeoutFromNativeError(err, AGENT_TOOL_NAMES.TYPE_TEXT);
        if (timeoutError !== null) {
          await emitToolError(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, timeoutError.payload);
          return { ok: false as const, error: timeoutError.payload };
        }
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.TYPE_TEXT, message);
        return { ok: false as const, error: message };
      }
    },
  });
}

const keyTapLogicalKeySchema = z.enum(["enter", "tab", "escape", "backspace"]);

export function createKeyTapTool(ctx: LiveAgentToolContext) {
  return tool({
    description:
      "Press a single logical key in the focused application (OS keyboard simulation). Use key enter to submit prompts, send chat, or dialog OK; use escape to dismiss; tab to move focus.",
    inputSchema: zodSchema(
      z.object({
        key: keyTapLogicalKeySchema,
      }),
    ),
    execute: async (input) => {
      const permitted = await abortable(
        ctx.signal,
        requestToolPermission(ctx, AGENT_TOOL_NAMES.KEY_TAP, {
          summary: `Press ${input.key}`,
          rationale: "Keyboard automation requested by the model.",
          details: input.key,
        }),
      );
      if (!permitted) {
        return { ok: false as const, error: "Denied (permission or UI automation disabled)." };
      }
      throwIfAborted(ctx.signal);
      await emitToolStarted(ctx, AGENT_TOOL_NAMES.KEY_TAP, input.key);
      const nativeGate = gateNativeTool(ctx.native, "uiAutomation");
      if (!nativeGate.ok) {
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.KEY_TAP, nativeGate.timelineSummary);
        return { ok: false as const, error: nativeGate.error };
      }
      try {
        await withToolTimeout(
          AGENT_TOOL_NAMES.KEY_TAP,
          abortable(
            ctx.signal,
            nativeGate.native.keyTap(input.key),
            nativeGate.native.cancelPointerAutomation,
          ),
          nativeGate.native.cancelPointerAutomation,
        );
        throwIfAborted(ctx.signal);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.KEY_TAP, "Sent.");
        return { ok: true as const };
      } catch (err) {
        if (ctx.signal.aborted || isCancellationError(err)) {
          await emitToolCancelled(ctx, AGENT_TOOL_NAMES.KEY_TAP, TOOL_CANCELLED_REASON);
          return { ok: false as const, error: TOOL_CANCELLED_REASON };
        }
        const timeoutError = toolTimeoutFromNativeError(err, AGENT_TOOL_NAMES.KEY_TAP);
        if (timeoutError !== null) {
          await emitToolError(ctx, AGENT_TOOL_NAMES.KEY_TAP, timeoutError.payload);
          return { ok: false as const, error: timeoutError.payload };
        }
        const message = err instanceof Error ? err.message : String(err);
        await emitToolCompleted(ctx, AGENT_TOOL_NAMES.KEY_TAP, message);
        return { ok: false as const, error: message };
      }
    },
  });
}
