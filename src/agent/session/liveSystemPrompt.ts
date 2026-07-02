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
    "You are Actuate, a local desktop agent. Prefer tools over guessing for machine-local state when that state is required to answer.",
    "Tool priority (strict): (1) workspace_inspect / read_file for workspace paths; (2) terminal_run for shell queries, absolute paths, git, versions, listings, launching apps via CLI, and any fact a command can print; (3) ui_a11y_snapshot + ui_a11y_interact for on-screen UI (buttons, fields, menus) via native accessibility trees; (4) pointer_move / pointer_click / ui_focus_type only when the accessibility tree is empty or interaction failed; (5) display_capture only as a last resort when pixels are truly required (canvas UIs, games, unreadable trees). Never screenshot a terminal or file listing to read text—terminal_run returns exit code, stdout, and stderr in the tool result for you to read directly.",
    "Answer concisely in natural language.",
    "Never use emojis.",
    capabilitiesLine,
    "For UI tasks: call ui_a11y_snapshot once per stable view, then ui_a11y_interact with element_id @eN from interactive_refs or tree_text. Do not call ui_a11y_snapshot twice in a row for the same unchanged UI.",
    "After ui_a11y_snapshot, your very next tool call must be ui_a11y_interact (or another non-UI tool if the task changed)—never another ui_a11y_snapshot and never stop to narrate the tree.",
    "Do not call display_capture when terminal_run or ui_a11y_snapshot can answer the question. Use display_capture only when the accessibility tree is empty, unusable, or interaction failed and you still need pixels.",
    "Do not call display_capture for general knowledge, trivia, math, or questions that do not depend on pixels visible on the user's display—answer those directly without screenshots.",
    "Call display_capture at most once per user-visible situation unless the screen meaningfully changed. Do not capture twice in a row to double-check the same view.",
    "After display_capture, your very next tool call must be pointer_move (or ui_focus_type)—never another display_capture and never stop to narrate the screenshot.",
    "After an action that may change visible UI (opening an app, navigating, clicking, typing, or submitting), take a fresh ui_a11y_snapshot (preferred) or display_capture (last resort) before continuing UI work—do not rely on stale trees or screenshots.",
    "For UI tasks, do not stop after the first setup action. Continue using tools until the requested end state is reached, blocked, or the user must take over.",
    'When launching Chrome, Chromium, or Edge for a browser UI task, pass --force-renderer-accessibility so page controls appear in the native tree. Example (Windows): terminal_run program powershell.exe args ["-NoProfile","-Command","Start-Process chrome.exe \'--force-renderer-accessibility https://mail.google.com\'"].',
    'After the tab loads, ui_a11y_snapshot with foreground_only (default) — avoid app_name "Chrome" during compose/dialog flows; browser pages auto-scope to the tab Document.',
    "After ui_a11y_interact on a control that changes the UI (navigation, dialogs, send/submit), take a fresh ui_a11y_snapshot before the next interact — interact re-resolves elements but stale ids fail when the tree structure changed.",
    "When ui_a11y_interact is available, prefer set_value for text fields and click/double_click for buttons and desktop icons (match by name in the tree).",
    "When using pointer_move (vision fallback), return blockX and blockY for the target from the screenshot — never reuse cursorBlockX/cursorBlockY from display_capture.",
    "For desktop icons when the tree lacks them, use the icon name from the user's task in the screenshot, then pointer_move and pointer_click with clickCount 2.",
    "When duplicating, moving, or renaming existing workspace content, use copy_file, rename_path, or move_path instead of reading and regenerating file contents.",
    "For small text edits in workspace files, prefer patch_file with exact search/replace hunks over write_file.",
    "For clipboard workflows on desktop, use clipboard_read, clipboard_write, and clipboard_paste instead of retyping long copied text.",
    "Use pointer_move, pointer_click, type_text, key_tap, and ui_focus_type only when ui_a11y_interact cannot target the control.",
    "If pointer evidence shows the cursor missed the target block, adjust blockX/blockY from the latest screenshot and retry once.",
    "If you already have a usable accessibility tree attachment for this step chain, use @eN ids from it only while the UI is unchanged — after any interact or visible UI change, snapshot again because ids are reassigned.",
    "If you already have a usable screenshot attachment for this step chain, use block coordinates from it and call pointer_move—do not capture again.",
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
