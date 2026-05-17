/**
 * Frozen surface for model-callable tools and consequence-based permissions (S1).
 * Agent loop, UI copy, and IPC adapters should derive from these identifiers — not ad-hoc strings.
 */

import type { PermissionChoice, PermissionMode } from "./types";

/** What could go wrong if the action runs without supervision (ADR 003). */
export type ConsequenceRiskClass =
  | "observe"
  | "execute_local"
  | "ui_automation"
  | "mutate_workspace";

export const AGENT_TOOL_NAMES = {
  WORKSPACE_INSPECT: "workspace.inspect",
  TERMINAL_RUN: "terminal.run",
  DISPLAY_CAPTURE: "display.capture",
  POINTER_MOVE: "pointer.move",
  POINTER_CLICK: "pointer.click",
  TYPE_TEXT: "type.text",
  FILE_READ: "file.read",
  FILE_WRITE: "file.write",
} as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[keyof typeof AGENT_TOOL_NAMES];

type ToolContractEntry = {
  /** Stable tool id exposed to the model and timeline. */
  name: AgentToolName;
  riskClass: ConsequenceRiskClass;
  /** Short label for timeline / cards. */
  displayName: string;
  /** One line for permission drawer “what”. */
  defaultPermissionTitle: string;
};

export const TOOL_CONTRACT: Record<AgentToolName, ToolContractEntry> = {
  [AGENT_TOOL_NAMES.WORKSPACE_INSPECT]: {
    name: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
    riskClass: "observe",
    displayName: "Workspace listing",
    defaultPermissionTitle: "List files in a workspace directory",
  },
  [AGENT_TOOL_NAMES.TERMINAL_RUN]: {
    name: AGENT_TOOL_NAMES.TERMINAL_RUN,
    riskClass: "execute_local",
    displayName: "Terminal",
    defaultPermissionTitle: "Allow a terminal command",
  },
  [AGENT_TOOL_NAMES.DISPLAY_CAPTURE]: {
    name: AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
    riskClass: "observe",
    displayName: "Screenshot",
    defaultPermissionTitle: "Allow screen capture",
  },
  [AGENT_TOOL_NAMES.POINTER_MOVE]: {
    name: AGENT_TOOL_NAMES.POINTER_MOVE,
    riskClass: "ui_automation",
    displayName: "Move pointer",
    defaultPermissionTitle: "Allow moving the mouse pointer",
  },
  [AGENT_TOOL_NAMES.POINTER_CLICK]: {
    name: AGENT_TOOL_NAMES.POINTER_CLICK,
    riskClass: "ui_automation",
    displayName: "Click",
    defaultPermissionTitle: "Allow a mouse click",
  },
  [AGENT_TOOL_NAMES.TYPE_TEXT]: {
    name: AGENT_TOOL_NAMES.TYPE_TEXT,
    riskClass: "ui_automation",
    displayName: "Type text",
    defaultPermissionTitle: "Allow typing into the focused application",
  },
  [AGENT_TOOL_NAMES.FILE_READ]: {
    name: AGENT_TOOL_NAMES.FILE_READ,
    riskClass: "observe",
    displayName: "Read file",
    defaultPermissionTitle: "Allow reading a file",
  },
  [AGENT_TOOL_NAMES.FILE_WRITE]: {
    name: AGENT_TOOL_NAMES.FILE_WRITE,
    riskClass: "mutate_workspace",
    displayName: "Write file",
    defaultPermissionTitle: "Allow writing a file",
  },
};

const RISK_CLASS_COPY: Record<
  ConsequenceRiskClass,
  { taxonomyLabel: string; userFacingRiskHint: string }
> = {
  observe: {
    taxonomyLabel: "Observation",
    userFacingRiskHint:
      "Reads pixels or file content from your machine. Does not change files or run commands by itself. On macOS, screen capture may require Screen Recording permission.",
  },
  execute_local: {
    taxonomyLabel: "Local execution",
    userFacingRiskHint:
      "Runs a program on your computer with the arguments and working directory you approve. Package installers and scripts can run code from dependencies — only use in workspaces you trust.",
  },
  ui_automation: {
    taxonomyLabel: "UI automation",
    userFacingRiskHint:
      "Drives the mouse and keyboard like a user. Could activate buttons, submit forms, or focus the wrong window. Treat as high impact outside a dedicated test environment.",
  },
  mutate_workspace: {
    taxonomyLabel: "Workspace changes",
    userFacingRiskHint:
      "Can create, overwrite, or delete files within allowed paths. Review the exact path before approving.",
  },
};

export function riskClassTaxonomyLabel(riskClass: ConsequenceRiskClass): string {
  return RISK_CLASS_COPY[riskClass].taxonomyLabel;
}

export function riskClassUserHint(riskClass: ConsequenceRiskClass): string {
  return RISK_CLASS_COPY[riskClass].userFacingRiskHint;
}

export function riskClassForTool(name: AgentToolName): ConsequenceRiskClass {
  return TOOL_CONTRACT[name].riskClass;
}

/** Permission drawer: line explaining the risk category (aligned with S1 taxonomy). */
export function formatRiskLineForTool(name: AgentToolName): string {
  const rc = riskClassForTool(name);
  const tax = riskClassTaxonomyLabel(rc);
  const hint = riskClassUserHint(rc);
  return `${tax}: ${hint}`;
}

export const PERMISSION_CHOICE_LABELS: Record<PermissionChoice, string> = {
  allow_once: "Allow once",
  allow_session: "Allow for this session",
  allow_always: "Always allow this category",
  deny: "Deny",
};

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  ask_risky: "Ask before risky actions",
  ask_all: "Ask before every meaningful action",
  session_low_risk:
    "Allow low-risk actions this session (dev shortcut — full policy wiring follows S4)",
};
