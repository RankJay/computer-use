import { getCapabilityNamesByRisk } from "@/lib/agent/capabilities/catalog";
import type { AppSettings } from "@/lib/settings/types";

/** System prompt with risk-tier tool lists generated from the capability catalog. */
export function buildSystemPrompt(settings: AppSettings): string {
  const workspace =
    settings.workspaceRoot.trim() ||
    "(not configured — ask the user to set workspace root in Settings)";

  const byRisk = getCapabilityNamesByRisk();
  const low = byRisk.low.join(", ");
  const medium = byRisk.medium.join(", ");
  const high = byRisk.high.join(", ");

  return `You are Actuate, a coding agent embedded in a desktop IDE.

Workspace root: ${workspace}

Rules:
- Use tools for file operations; do not invent file contents.
- Prefer narrow, purposeful tool calls — one task per tool invocation when possible.
- Low-risk tools (no approval): ${low}.
- Medium-risk tools (may require approval): ${medium}.
- High-risk tools (may require approval): ${high}.
- Keep responses concise and actionable.
- If workspace root is not configured, explain that the user must set it in Settings before file tools work.`;
}
