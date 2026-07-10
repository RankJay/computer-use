import type { AppSettings } from "@/lib/settings/types";

/** Live runs require a configured workspace root; demo mode does not. */
export function isLiveWorkspaceReady(settings: AppSettings): boolean {
  if (settings.agentMode !== "live") return true;
  return settings.workspaceRoot.trim().length > 0;
}
