/**
 * Frozen surface for model-callable tools and consequence-based permissions (S1).
 * Agent loop, UI copy, and IPC adapters should derive from these identifiers — not ad-hoc strings.
 */

import type { AgentActivitySurface, PermissionChoice, PermissionMode } from "./types";

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
  KEY_TAP: "key.tap",
  UI_FOCUS_TYPE: "ui.focusType",
  UI_A11Y_SNAPSHOT: "ui.a11y.snapshot",
  UI_A11Y_INTERACT: "ui.a11y.interact",
  FILE_READ: "file.read",
  FILE_WRITE: "file.write",
  FILE_COPY: "file.copy",
  PATH_MOVE: "path.move",
  PATH_RENAME: "path.rename",
  FILE_PATCH: "file.patch",
  CLIPBOARD_READ: "clipboard.read",
  CLIPBOARD_WRITE: "clipboard.write",
  CLIPBOARD_PASTE: "clipboard.paste",
} as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[keyof typeof AGENT_TOOL_NAMES];

/** AI SDK / model-facing tool registry keys (snake_case). */
export const MODEL_TOOL_KEYS = {
  TERMINAL_RUN: "terminal_run",
  WORKSPACE_INSPECT: "workspace_inspect",
  DISPLAY_CAPTURE: "display_capture",
  READ_FILE: "read_file",
  WRITE_FILE: "write_file",
  COPY_FILE: "copy_file",
  MOVE_PATH: "move_path",
  RENAME_PATH: "rename_path",
  PATCH_FILE: "patch_file",
  CLIPBOARD_READ: "clipboard_read",
  CLIPBOARD_WRITE: "clipboard_write",
  CLIPBOARD_PASTE: "clipboard_paste",
  POINTER_MOVE: "pointer_move",
  POINTER_CLICK: "pointer_click",
  TYPE_TEXT: "type_text",
  KEY_TAP: "key_tap",
  UI_FOCUS_TYPE: "ui_focus_type",
  UI_A11Y_SNAPSHOT: "ui_a11y_snapshot",
  UI_A11Y_INTERACT: "ui_a11y_interact",
} as const;

export type ModelToolKey = (typeof MODEL_TOOL_KEYS)[keyof typeof MODEL_TOOL_KEYS];

/** One model registry key maps to exactly one internal contract id. */
export const MODEL_TOOL_TO_AGENT_TOOL: Record<ModelToolKey, AgentToolName> = {
  [MODEL_TOOL_KEYS.TERMINAL_RUN]: AGENT_TOOL_NAMES.TERMINAL_RUN,
  [MODEL_TOOL_KEYS.WORKSPACE_INSPECT]: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
  [MODEL_TOOL_KEYS.DISPLAY_CAPTURE]: AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
  [MODEL_TOOL_KEYS.READ_FILE]: AGENT_TOOL_NAMES.FILE_READ,
  [MODEL_TOOL_KEYS.WRITE_FILE]: AGENT_TOOL_NAMES.FILE_WRITE,
  [MODEL_TOOL_KEYS.COPY_FILE]: AGENT_TOOL_NAMES.FILE_COPY,
  [MODEL_TOOL_KEYS.MOVE_PATH]: AGENT_TOOL_NAMES.PATH_MOVE,
  [MODEL_TOOL_KEYS.RENAME_PATH]: AGENT_TOOL_NAMES.PATH_RENAME,
  [MODEL_TOOL_KEYS.PATCH_FILE]: AGENT_TOOL_NAMES.FILE_PATCH,
  [MODEL_TOOL_KEYS.CLIPBOARD_READ]: AGENT_TOOL_NAMES.CLIPBOARD_READ,
  [MODEL_TOOL_KEYS.CLIPBOARD_WRITE]: AGENT_TOOL_NAMES.CLIPBOARD_WRITE,
  [MODEL_TOOL_KEYS.CLIPBOARD_PASTE]: AGENT_TOOL_NAMES.CLIPBOARD_PASTE,
  [MODEL_TOOL_KEYS.POINTER_MOVE]: AGENT_TOOL_NAMES.POINTER_MOVE,
  [MODEL_TOOL_KEYS.POINTER_CLICK]: AGENT_TOOL_NAMES.POINTER_CLICK,
  [MODEL_TOOL_KEYS.TYPE_TEXT]: AGENT_TOOL_NAMES.TYPE_TEXT,
  [MODEL_TOOL_KEYS.KEY_TAP]: AGENT_TOOL_NAMES.KEY_TAP,
  [MODEL_TOOL_KEYS.UI_FOCUS_TYPE]: AGENT_TOOL_NAMES.UI_FOCUS_TYPE,
  [MODEL_TOOL_KEYS.UI_A11Y_SNAPSHOT]: AGENT_TOOL_NAMES.UI_A11Y_SNAPSHOT,
  [MODEL_TOOL_KEYS.UI_A11Y_INTERACT]: AGENT_TOOL_NAMES.UI_A11Y_INTERACT,
};

export function agentToolNameForModelToolKey(key: ModelToolKey): AgentToolName {
  return MODEL_TOOL_TO_AGENT_TOOL[key];
}

type ToolContractEntry = {
  /** Stable tool id exposed to the model and timeline. */
  name: AgentToolName;
  riskClass: ConsequenceRiskClass;
  /** Maximum wall-clock time for one tool execution before reporting a structured timeout. */
  timeoutMs: number;
  /** Whether AbortSignal cancellation can interrupt or only stop before/after execution. */
  cancellation: string;
  /** Short label for timeline / cards. */
  displayName: string;
  /** UI surface used when this tool appears in the activity timeline. */
  displaySurface: AgentActivitySurface;
  /** One line for permission drawer “what”. */
  defaultPermissionTitle: string;
};

export const TOOL_CONTRACT: Record<AgentToolName, ToolContractEntry> = {
  [AGENT_TOOL_NAMES.WORKSPACE_INSPECT]: {
    name: AGENT_TOOL_NAMES.WORKSPACE_INSPECT,
    riskClass: "observe",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the directory read.",
    displayName: "Workspace listing",
    displaySurface: "task",
    defaultPermissionTitle: "List files in a workspace directory",
  },
  [AGENT_TOOL_NAMES.TERMINAL_RUN]: {
    name: AGENT_TOOL_NAMES.TERMINAL_RUN,
    riskClass: "execute_local",
    timeoutMs: 120_000,
    cancellation: "Honors cancellation mid-command by killing the spawned child process.",
    displayName: "Terminal",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow a terminal command",
  },
  [AGENT_TOOL_NAMES.DISPLAY_CAPTURE]: {
    name: AGENT_TOOL_NAMES.DISPLAY_CAPTURE,
    riskClass: "observe",
    timeoutMs: 10_000,
    cancellation: "Honors cancellation before and after the native capture.",
    displayName: "Screenshot",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow screen capture (last resort)",
  },
  [AGENT_TOOL_NAMES.UI_A11Y_SNAPSHOT]: {
    name: AGENT_TOOL_NAMES.UI_A11Y_SNAPSHOT,
    riskClass: "observe",
    timeoutMs: 30_000,
    cancellation: "Honors cancellation before and after the accessibility tree walk.",
    displayName: "UI tree",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow accessibility tree snapshot",
  },
  [AGENT_TOOL_NAMES.UI_A11Y_INTERACT]: {
    name: AGENT_TOOL_NAMES.UI_A11Y_INTERACT,
    riskClass: "ui_automation",
    timeoutMs: 30_000,
    cancellation: "Honors cancellation before the accessibility interaction starts.",
    displayName: "UI interact",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow accessibility-driven UI interaction",
  },
  [AGENT_TOOL_NAMES.POINTER_MOVE]: {
    name: AGENT_TOOL_NAMES.POINTER_MOVE,
    riskClass: "ui_automation",
    timeoutMs: 10_000,
    cancellation: "Honors cancellation mid-move between pointer animation steps.",
    displayName: "Move pointer",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow moving the mouse pointer",
  },
  [AGENT_TOOL_NAMES.POINTER_CLICK]: {
    name: AGENT_TOOL_NAMES.POINTER_CLICK,
    riskClass: "ui_automation",
    timeoutMs: 10_000,
    cancellation: "Honors cancellation before the click is synthesized.",
    displayName: "Click",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow a mouse click",
  },
  [AGENT_TOOL_NAMES.TYPE_TEXT]: {
    name: AGENT_TOOL_NAMES.TYPE_TEXT,
    riskClass: "ui_automation",
    timeoutMs: 10_000,
    cancellation: "Honors cancellation before the typing burst starts.",
    displayName: "Type text",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow typing into the focused application",
  },
  [AGENT_TOOL_NAMES.KEY_TAP]: {
    name: AGENT_TOOL_NAMES.KEY_TAP,
    riskClass: "ui_automation",
    timeoutMs: 10_000,
    cancellation: "Honors cancellation before the key press is synthesized.",
    displayName: "Key tap",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow a single key press (e.g. Enter)",
  },
  [AGENT_TOOL_NAMES.UI_FOCUS_TYPE]: {
    name: AGENT_TOOL_NAMES.UI_FOCUS_TYPE,
    riskClass: "ui_automation",
    timeoutMs: 15_000,
    cancellation: "Honors cancellation before the focus-and-type sequence starts.",
    displayName: "Focus and type",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow focusing a control and typing into it",
  },
  [AGENT_TOOL_NAMES.FILE_READ]: {
    name: AGENT_TOOL_NAMES.FILE_READ,
    riskClass: "observe",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the file read.",
    displayName: "Read file",
    displaySurface: "task",
    defaultPermissionTitle: "Allow reading a file",
  },
  [AGENT_TOOL_NAMES.FILE_WRITE]: {
    name: AGENT_TOOL_NAMES.FILE_WRITE,
    riskClass: "mutate_workspace",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the file write.",
    displayName: "Write file",
    displaySurface: "task",
    defaultPermissionTitle: "Allow writing a file",
  },
  [AGENT_TOOL_NAMES.FILE_COPY]: {
    name: AGENT_TOOL_NAMES.FILE_COPY,
    riskClass: "mutate_workspace",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the file copy.",
    displayName: "Copy file",
    displaySurface: "task",
    defaultPermissionTitle: "Allow copying a file",
  },
  [AGENT_TOOL_NAMES.PATH_MOVE]: {
    name: AGENT_TOOL_NAMES.PATH_MOVE,
    riskClass: "mutate_workspace",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the move or rename.",
    displayName: "Move path",
    displaySurface: "task",
    defaultPermissionTitle: "Allow moving or renaming a path",
  },
  [AGENT_TOOL_NAMES.PATH_RENAME]: {
    name: AGENT_TOOL_NAMES.PATH_RENAME,
    riskClass: "mutate_workspace",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the rename.",
    displayName: "Rename path",
    displaySurface: "task",
    defaultPermissionTitle: "Allow renaming a workspace path",
  },
  [AGENT_TOOL_NAMES.FILE_PATCH]: {
    name: AGENT_TOOL_NAMES.FILE_PATCH,
    riskClass: "mutate_workspace",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the structured edit.",
    displayName: "Patch file",
    displaySurface: "task",
    defaultPermissionTitle: "Allow structured edits to a workspace file",
  },
  [AGENT_TOOL_NAMES.CLIPBOARD_READ]: {
    name: AGENT_TOOL_NAMES.CLIPBOARD_READ,
    riskClass: "observe",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before and after the clipboard read.",
    displayName: "Read clipboard",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow reading the system clipboard",
  },
  [AGENT_TOOL_NAMES.CLIPBOARD_WRITE]: {
    name: AGENT_TOOL_NAMES.CLIPBOARD_WRITE,
    riskClass: "ui_automation",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before writing to the clipboard.",
    displayName: "Write clipboard",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow writing to the system clipboard",
  },
  [AGENT_TOOL_NAMES.CLIPBOARD_PASTE]: {
    name: AGENT_TOOL_NAMES.CLIPBOARD_PASTE,
    riskClass: "ui_automation",
    timeoutMs: 5_000,
    cancellation: "Honors cancellation before the paste shortcut is synthesized.",
    displayName: "Paste",
    displaySurface: "thought",
    defaultPermissionTitle: "Allow pasting into the focused application",
  },
};

export function isAgentToolName(value: string): value is AgentToolName {
  return value in TOOL_CONTRACT;
}

/** Accept dotted contract ids; migrate legacy snake_case model keys; drop unknown values. */
export function normalizePersistedApprovals(raw: readonly string[]): AgentToolName[] {
  const seen = new Set<AgentToolName>();
  const normalized: AgentToolName[] = [];

  for (const id of raw) {
    let tool: AgentToolName | undefined;
    if (isAgentToolName(id)) {
      tool = id;
    } else if (id in MODEL_TOOL_TO_AGENT_TOOL) {
      tool = MODEL_TOOL_TO_AGENT_TOOL[id as ModelToolKey];
    }
    if (tool !== undefined && !seen.has(tool)) {
      seen.add(tool);
      normalized.push(tool);
    }
  }

  return normalized;
}

const RISK_CLASS_COPY: Record<
  ConsequenceRiskClass,
  { taxonomyLabel: string; userFacingRiskHint: string }
> = {
  observe: {
    taxonomyLabel: "Observation",
    userFacingRiskHint:
      "Reads accessibility trees, pixels, or file content from your machine. Does not change files or run commands by itself. On macOS, screen capture may require Screen Recording permission; accessibility trees may require Accessibility permission.",
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

export function timeoutMsForTool(name: AgentToolName): number {
  return TOOL_CONTRACT[name].timeoutMs;
}

/** Tools that drive mouse/keyboard UI automation (excludes observe/execute/mutate). */
export function isUiAutomationToolName(value: string): boolean {
  return isAgentToolName(value) && riskClassForTool(value) === "ui_automation";
}

/** In-flight pointer move/click only (excludes type.text and key.tap). */
export function isPointerAutomationToolName(value: string): boolean {
  return value === AGENT_TOOL_NAMES.POINTER_MOVE || value === AGENT_TOOL_NAMES.POINTER_CLICK;
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
  session_low_risk: "Ask once per approved risk class this session",
};
