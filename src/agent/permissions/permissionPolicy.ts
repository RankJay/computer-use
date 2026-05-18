import {
  AGENT_TOOL_NAMES,
  type AgentToolName,
  type ConsequenceRiskClass,
  riskClassForTool,
} from "@/agent/toolContract";
import type { PermissionMode } from "@/agent/types";

export function consequenceRequiresPrompt(
  mode: PermissionMode,
  risk: ConsequenceRiskClass,
): boolean {
  switch (mode) {
    case "session_low_risk":
      return false;
    case "ask_all":
      return true;
    case "ask_risky":
      return risk !== "observe";
    default: {
      const _never: never = mode;
      return _never;
    }
  }
}

export function toolRequiresPermissionPrompt(mode: PermissionMode, tool: AgentToolName): boolean {
  return consequenceRequiresPrompt(mode, riskClassForTool(tool));
}

export function isUiAutomationTool(tool: AgentToolName): boolean {
  return (
    tool === AGENT_TOOL_NAMES.POINTER_MOVE ||
    tool === AGENT_TOOL_NAMES.POINTER_CLICK ||
    tool === AGENT_TOOL_NAMES.TYPE_TEXT ||
    tool === AGENT_TOOL_NAMES.KEY_TAP
  );
}
