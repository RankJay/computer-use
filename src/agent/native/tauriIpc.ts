/**
 * Tauri `invoke` names and payloads (S2). Matches `src-tauri` command handlers.
 */

export const TAURI_COMMAND = {
  capturePrimaryDisplayPngBase64: "capture_primary_display_png_base64",
  runCommand: "run_command",
  pointerMoveTo: "pointer_move_to",
  pointerClick: "pointer_click",
  typeText: "type_text",
  keyTap: "key_tap",
  resetPointerAutomationCancel: "reset_pointer_automation_cancel",
  cancelPointerAutomation: "cancel_pointer_automation",
  loadSettings: "load_settings",
  saveSettings: "save_settings",
  loadSecret: "load_secret",
  storeSecret: "store_secret",
  deleteSecret: "delete_secret",
  appendSessionLog: "append_session_log",
  writeSessionKeyframe: "write_session_keyframe",
  clearAllLogs: "clear_all_logs",
  openLogsFolder: "open_logs_folder",
  readWorkspaceFile: "read_workspace_file",
  writeWorkspaceFile: "write_workspace_file",
  listWorkspaceDir: "list_workspace_dir",
} as const;

export type LlmApiProvider = "anthropic" | "openai";

export type AppSettingsPayload = {
  workspaceRoot: string | null;
  permissionMode: string;
  retentionDays: number;
  /** Live runs using Anthropic when this provider is active and a key is saved. */
  anthropicModelId: string;
  /** Live runs using OpenAI when this provider is active and a key is saved. */
  openaiModelId: string;
  /** Used only when both API keys are saved; otherwise inferred from which key exists. */
  activeApiProvider: LlmApiProvider;
  agentMode: string;
  persistedApprovals: string[];
  uiAutomationEnabled: boolean;
};

export type RunCommandRequest = {
  program: string;
  args: string[];
  cwd: string | null;
  /** Process wait timeout (ms). Defaults on backend ~120s. */
  timeoutMs?: number | null;
  /** Max bytes read per stdout/stderr stream. */
  maxOutputBytes?: number | null;
};

export type RunCommandResponse = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type PointerButton = "left" | "right" | "middle";

export const KEY_TAP_LOGICAL_KEYS = ["enter", "tab", "escape", "backspace"] as const;
export type KeyTapLogicalKey = (typeof KEY_TAP_LOGICAL_KEYS)[number];

export type SaveSettingsRequest = {
  settings: AppSettingsPayload;
};

export type LoadSecretRequest = {
  key: string;
};

export type StoreSecretRequest = {
  key: string;
  value: string;
};

export type DeleteSecretRequest = {
  key: string;
};

export type AppendSessionLogRequest = {
  sessionId: string;
  line: string;
};

export type WriteSessionKeyframeRequest = {
  sessionId: string;
  filename: string;
  pngBase64: string;
};

/** Absolute path of the written keyframe PNG on disk. */
export type WriteSessionKeyframeResponse = string;

export type ReadWorkspaceFileRequest = {
  workspaceRoot: string;
  relativePath: string;
};

export type WriteWorkspaceFileRequest = {
  workspaceRoot: string;
  relativePath: string;
  content: string;
};

/** Absolute path of the written file on disk. */
export type WriteWorkspaceFileResponse = string;

export type ListWorkspaceDirRequest = {
  workspaceRoot: string;
  relativeDir: string;
};

export type ListWorkspaceDirResponse = string[];
