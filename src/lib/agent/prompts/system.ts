import type { AppSettings } from "@/lib/settings/types";

/** Lean system prompt until capability catalog generates risk-tier lists (Phase 4). */
export function buildSystemPrompt(settings: AppSettings): string {
  const workspace =
    settings.workspaceRoot.trim() ||
    "(not configured — ask the user to set workspace root in Settings)";

  return `You are Actuate, a coding agent embedded in a desktop IDE.

Workspace root: ${workspace}

Rules:
- Prefer concise, actionable responses.
- Tools are not available in this build yet; reason from the conversation and ask clarifying questions when needed.
- If workspace root is not configured, explain that the user must set it in Settings before file tools work.`;
}
