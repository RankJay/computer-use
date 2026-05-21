import { describeRuntimeCapabilities, type HostOsKind } from "@/agent/hostEnvironment";

export type LiveRuntimePromptContext = {
  readonly nativeBridge: boolean;
  readonly hostOs: HostOsKind;
  readonly uiAutomationEnabled: boolean;
  readonly workspaceRoot: string | null;
  readonly prompt: string;
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
    "Use display_capture only when the task is about on-screen UI, layout, a specific app window, debugging something visible, or you truly need fresh pixels to proceed.",
    "Call display_capture at most once per user-visible situation unless the screen meaningfully changed (new window, scrolled content, different app focused). Do not capture twice in a row to double-check the same view—the latest PNG is enough.",
    "When duplicating, moving, or renaming existing workspace content, use copy_file or move_path instead of reading and regenerating file contents.",
    "When UI automation is enabled and the task is to interact with visible UI (another app window, dialogs, prompts), capture at most once to orient, infer targets from that image, then act: pointer_move to the control, pointer_click if needed for focus, type_text for literals, key_tap with key enter when the user wants Submit/Run/Send—not only describe the screenshot.",
    "If you already have a usable screenshot attachment for this step chain, assume coordinates from it and proceed with pointer tools instead of capturing again.",
    "You have no web_search tool. If the user asks for live web lookup or very current facts, say you cannot browse the web, give best-effort general knowledge, and suggest they verify with a browser.",
    "If workspace root is unset, file listing/reading may fail—use terminal_run on absolute paths when the desktop app and native tools are available.",
  ].join(" ");
}

export function buildLiveUserMessage(
  capabilitiesLine: string,
  workspaceRoot: string | null,
  prompt: string,
): string {
  const workspaceLine =
    workspaceRoot && workspaceRoot.length > 0
      ? workspaceRoot
      : "(workspace not set — set in Settings)";
  return `${capabilitiesLine}

Workspace root: ${workspaceLine}

User task:
${prompt}`;
}

export function buildLivePromptBundle(ctx: LiveRuntimePromptContext): {
  readonly capabilitiesLine: string;
  readonly system: string;
  readonly userMessage: string;
} {
  const capabilitiesLine = buildLiveCapabilitiesLine(ctx);
  return {
    capabilitiesLine,
    system: buildLiveSystemPrompt(capabilitiesLine),
    userMessage: buildLiveUserMessage(capabilitiesLine, ctx.workspaceRoot, ctx.prompt),
  };
}
