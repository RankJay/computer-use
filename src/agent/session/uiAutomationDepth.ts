import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import type { AgentEvent } from "@/agent/types";

const POINTER_TOOLS = new Set<string>([
  AGENT_TOOL_NAMES.POINTER_MOVE,
  AGENT_TOOL_NAMES.POINTER_CLICK,
]);

/** In-flight mouse move or click automation (excluding type.text alone). */
export function countOpenPointerTools(events: readonly AgentEvent[]): number {
  let depth = 0;
  for (const e of events) {
    if (e.type === "tool.started" && POINTER_TOOLS.has(e.toolName)) {
      depth += 1;
    }
    if (e.type === "tool.completed" && POINTER_TOOLS.has(e.toolName)) {
      depth -= 1;
    }
    if (depth < 0) {
      depth = 0;
    }
  }
  return depth;
}

const UI_AUTOMATION_TOOLS = new Set<string>([
  AGENT_TOOL_NAMES.POINTER_MOVE,
  AGENT_TOOL_NAMES.POINTER_CLICK,
  AGENT_TOOL_NAMES.TYPE_TEXT,
  AGENT_TOOL_NAMES.KEY_TAP,
]);

/** How many UI automation tools are currently in-flight (started but not completed). */
export function countOpenUiAutomationTools(events: readonly AgentEvent[]): number {
  let depth = 0;
  for (const e of events) {
    if (e.type === "tool.started" && UI_AUTOMATION_TOOLS.has(e.toolName)) {
      depth += 1;
    }
    if (e.type === "tool.completed" && UI_AUTOMATION_TOOLS.has(e.toolName)) {
      depth -= 1;
    }
    if (depth < 0) {
      depth = 0;
    }
  }
  return depth;
}
