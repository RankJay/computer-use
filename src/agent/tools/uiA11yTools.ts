import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import type { UiA11ySnapshotResult } from "@/agent/native/nativeBridge";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { shortenForTimeline } from "@/agent/tools/toolTimeline";
import {
  isRepeatA11ySnapshotBlocked,
  rememberA11ySnapshot,
  clearPendingCapture,
} from "@/agent/tools/uiAutomationState";

const REPEAT_A11Y_SNAPSHOT_ERROR =
  "Blocked: you already have an accessibility tree for this UI state. Pick an element id (@eN) and call ui_a11y_interact, or snapshot again only after the UI meaningfully changed.";

const elementIdSchema = z
  .string()
  .trim()
  .regex(/^@e\d+$/i, "element_id must look like @e3");

const a11yActionSchema = z.enum(["click", "double_click", "set_value", "focus"]);

export function createUiA11ySnapshotTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.UI_A11Y_SNAPSHOT,
    description:
      "Preferred UI discovery: snapshot the native accessibility tree for the foreground app (or app_name). Returns element ids (@eN), roles, names, and values. Browser pages (Chrome, Edge) auto-scope to the tab Document and default interactive_only=true for dense sites like Gmail. Use before pointer_move or display_capture for standard desktop controls. Call once per stable UI state.",
    inputSchema: zodSchema(
      z.object({
        app_name: z.string().trim().min(1).optional(),
        foreground_only: z.boolean().optional(),
        max_depth: z.number().int().min(4).max(20).optional(),
        interactive_only: z.boolean().optional(),
      }),
    ),
    nativeGate: "a11ySnapshot",
    preflight: () => {
      if (isRepeatA11ySnapshotBlocked(ctx.uiAutomation)) {
        return { ok: false, error: REPEAT_A11Y_SNAPSHOT_ERROR };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: input.app_name
        ? `Accessibility tree for ${input.app_name}`
        : "Accessibility tree for foreground app",
      rationale: "Structured UI discovery requested by the model.",
      details: input.foreground_only === false ? "foreground_only=false" : "foreground app",
    }),
    deniedError: "User denied accessibility tree snapshot.",
    describe: (input) => input.app_name ?? "foreground",
    execute: async (input, _executeCtx, native) => {
      const snapshot = await native.uiA11ySnapshot({
        appName: input.app_name ?? null,
        foregroundOnly: input.foreground_only ?? null,
        maxDepth: input.max_depth ?? null,
        interactiveOnly: input.interactive_only ?? null,
      });
      rememberA11ySnapshot(ctx.uiAutomation);
      ctx.a11y.latestSnapshot = snapshot;
      return formatSnapshotResult(snapshot);
    },
  });
}

export function createUiA11yInteractTool(ctx: LiveAgentToolContext) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.UI_A11Y_INTERACT,
    description:
      "Act on a control from the latest ui_a11y_snapshot using its element id (@eN). Actions: click, double_click (desktop icons), set_value (text fields), focus. Prefer this over pointer_move / ui_focus_type when the tree exposes the target.",
    inputSchema: zodSchema(
      z.object({
        element_id: elementIdSchema,
        action: a11yActionSchema,
        text: z.string().optional(),
        click_count: z.number().int().min(1).max(2).optional(),
      }),
    ),
    nativeGate: "uiAutomation",
    preflight: (input) => {
      if (input.action === "set_value" && (input.text === undefined || input.text.length === 0)) {
        return { ok: false, error: "text is required when action is set_value" };
      }
      return { ok: true };
    },
    permission: (input) => ({
      summary: `${input.action} ${input.element_id}`,
      rationale: "Accessibility-driven UI automation requested by the model.",
      details: `element_id=${input.element_id} action=${input.action}`,
    }),
    deniedError: "Denied (permission or UI automation disabled).",
    describe: (input) => `${input.action} ${input.element_id}`,
    execute: async (input, _executeCtx, native) => {
      try {
        const result = await native.uiA11yInteract({
          elementId: input.element_id,
          action: input.action,
          text: input.text ?? null,
          clickCount: input.click_count ?? null,
        });
        clearPendingCapture(ctx.uiAutomation);
        ctx.a11y.latestSnapshot = null;
        return {
          ok: true,
          value: {
            elementId: result.elementId,
            action: result.action,
            message: result.message,
          },
          timelineSummary: shortenForTimeline(result.message),
        };
      } catch (error) {
        clearPendingCapture(ctx.uiAutomation);
        ctx.a11y.latestSnapshot = null;
        throw error;
      }
    },
  });
}

function formatSnapshotResult(snapshot: UiA11ySnapshotResult) {
  const summary = `${snapshot.app}: ${snapshot.interactiveCount} interactive / ${snapshot.elementCount} nodes`;
  return {
    ok: true as const,
    value: {
      platform: snapshot.platform,
      app: snapshot.app,
      elementCount: snapshot.elementCount,
      interactiveCount: snapshot.interactiveCount,
      truncated: snapshot.truncated,
      treeText: snapshot.treeText,
      interactiveRefs: snapshot.interactiveRefs,
      nextStep: snapshot.nextStep,
    },
    timelineSummary: summary,
  };
}
