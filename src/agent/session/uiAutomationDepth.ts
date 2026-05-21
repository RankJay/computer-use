import { isPointerAutomationToolName, isUiAutomationToolName } from "@/agent/toolContract";
import type { AgentEvent } from "@/agent/types";

function countOpenTools(
  events: readonly AgentEvent[],
  matchesTool: (toolName: string) => boolean,
): number {
  let depth = 0;
  for (const e of events) {
    if (e.type === "tool.started" && matchesTool(e.toolName)) {
      depth += 1;
    }
    if ((e.type === "tool.completed" || e.type === "tool.cancelled") && matchesTool(e.toolName)) {
      depth -= 1;
    }
    if (depth < 0) {
      depth = 0;
    }
  }
  return depth;
}

/** In-flight mouse move or click automation (excluding type.text and key.tap). */
export function countOpenPointerTools(events: readonly AgentEvent[]): number {
  return countOpenTools(events, isPointerAutomationToolName);
}

/** How many UI automation tools are currently in-flight (started but not completed). */
export function countOpenUiAutomationTools(events: readonly AgentEvent[]): number {
  return countOpenTools(events, isUiAutomationToolName);
}
