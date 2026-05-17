/**
 * Tauri `invoke` names and payloads (S2). Matches `src-tauri` command handlers.
 */

export const TAURI_COMMAND = {
  capturePrimaryDisplayPngBase64: "capture_primary_display_png_base64",
  runCommand: "run_command",
  pointerMoveTo: "pointer_move_to",
  pointerClick: "pointer_click",
  typeText: "type_text",
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

export type AppSettingsPayload = {
  workspaceRoot: string | null;
  permissionMode: string;
  retentionDays: number;
  modelId: string;
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
