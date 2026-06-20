import type { ModelMessage } from "ai";

import { describeRuntimeCapabilities, type HostOsKind } from "@/agent/hostEnvironment";
import type { AgentTimelineItem } from "@/agent/types";

export type LiveRuntimePromptContext = {
  readonly nativeBridge: boolean;
  readonly hostOs: HostOsKind;
  readonly uiAutomationEnabled: boolean;
  readonly workspaceRoot: string | null;
  readonly conversationTimeline: readonly AgentTimelineItem[];
};

export function buildLiveCapabilitiesLine(ctx: LiveRuntimePromptContext): string {
  return describeRuntimeCapabilities({
    nativeBridge: ctx.nativeBridge,
    hostOs: ctx.hostOs,
    uiAutomationEnabled: ctx.uiAutomationEnabled,
  });
}

export function buildLiveSystemPrompt(capabilitiesLine: string): string {
  return [
    "You are Actuate, a local desktop agent. Prefer tools over guessing for machine-local state (files, terminal, what is on screen) when that state is required to answer.",
    "Answer concisely in natural language.",
    "Never use emojis.",
    capabilitiesLine,
    "Do not call display_capture for general knowledge, trivia, math, or questions that do not depend on pixels visible on the user's display—answer those directly without screenshots.",
    "Use display_capture only when the task is about on-screen UI, layout, a specific app window, debugging something visible, or you truly need fresh pixels to proceed. After a screenshot, decide the next tool action; do not narrate or explain the screenshot unless the user explicitly asked for that.",
    "Call display_capture at most once per user-visible situation unless the screen meaningfully changed (new window, scrolled content, different app focused). Do not capture twice in a row to double-check the same view—the latest PNG is enough.",
    "After an action that may change visible UI (opening an app, navigating, clicking, typing, or submitting), do not rely on an earlier screenshot; capture the changed screen when pixels are needed to continue.",
    "For UI tasks, do not stop after the first setup action. Continue using tools until the requested end state is reached, blocked, or the user must take over.",
    "When using pointer_move, coordinates are pixels from the top-left of the latest display_capture image. Pick the center of the target control.",
    "When duplicating, moving, or renaming existing workspace content, use copy_file or move_path instead of reading and regenerating file contents.",
    "When UI automation is enabled and the task is to enter literal text into a visible input, prefer ui_focus_type with the target center coordinates and text instead of chaining pointer_move, pointer_click, and type_text separately.",
    "Use pointer_move, pointer_click, type_text, and key_tap separately only for non-text-entry UI actions or when ui_focus_type is insufficient.",
    "If pointer evidence shows the cursor missed the target, adjust coordinates from the latest screenshot and retry once with corrected coordinates. Do not repeat the same ui_focus_type call with identical coordinates in one run.",
    "If you already have a usable screenshot attachment for this step chain, assume coordinates from it and proceed with pointer tools instead of capturing again.",
    "You have no web_search tool. If the user asks for live web lookup or very current facts, say you cannot browse the web, give best-effort general knowledge, and suggest they verify with a browser.",
    "If workspace root is unset, file listing/reading may fail—use terminal_run on absolute paths when the desktop app and native tools are available.",
  ].join(" ");
}

function formatWorkspaceContext(capabilitiesLine: string, workspaceRoot: string | null): string {
  const workspaceLine =
    workspaceRoot && workspaceRoot.length > 0
      ? workspaceRoot
      : "(workspace not set — set in Settings)";
  return `${capabilitiesLine}

Workspace root: ${workspaceLine}`;
}

function formatActivityMessage(item: Extract<AgentTimelineItem, { kind: "activity" }>): string {
  const rows = item.rows
    .map((row) => {
      const detail = row.detail && row.detail.length > 0 ? `: ${row.detail}` : "";
      const error = row.toolError ? ` (${row.toolError.kind})` : "";
      return `- ${row.title}${detail}${error}`;
    })
    .join("\n");
  return `Agent activity (${item.status}):\n${rows}`;
}

export function buildLiveMessages(
  capabilitiesLine: string,
  workspaceRoot: string | null,
  conversationTimeline: readonly AgentTimelineItem[],
): ModelMessage[] {
  let lastUserIndex = -1;
  for (let index = conversationTimeline.length - 1; index >= 0; index -= 1) {
    if (conversationTimeline[index]?.kind === "user") {
      lastUserIndex = index;
      break;
    }
  }
  const context = formatWorkspaceContext(capabilitiesLine, workspaceRoot);
  const messages: ModelMessage[] = [];

  for (const [index, item] of conversationTimeline.entries()) {
    switch (item.kind) {
      case "user": {
        const content =
          index === lastUserIndex
            ? `${context}

User task:
${item.text}`
            : item.text;
        messages.push({ role: "user", content });
        break;
      }
      case "assistant":
        if (item.text.trim().length > 0) {
          messages.push({ role: "assistant", content: item.text });
        }
        break;
      case "activity":
        if (item.rows.length > 0) {
          messages.push({ role: "assistant", content: formatActivityMessage(item) });
        }
        break;
      default: {
        const _exhaustive: never = item;
        return _exhaustive;
      }
    }
  }

  return messages;
}

export function buildLivePromptBundle(ctx: LiveRuntimePromptContext): {
  readonly capabilitiesLine: string;
  readonly system: string;
  readonly messages: ModelMessage[];
} {
  const capabilitiesLine = buildLiveCapabilitiesLine(ctx);
  return {
    capabilitiesLine,
    system: buildLiveSystemPrompt(capabilitiesLine),
    messages: buildLiveMessages(capabilitiesLine, ctx.workspaceRoot, ctx.conversationTimeline),
  };
}
