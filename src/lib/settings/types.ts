export type PermissionMode = "risky" | "every-meaningful" | "destructive-only" | "once-per-class";

export type AgentMode = "live" | "demo";

/** Label/value pair for settings `<Select>` options. */
export type SettingsSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export type AppSettings = {
  workspaceRoot: string;
  logRetentionDays: number;
  permissionMode: PermissionMode;
  uiAutomation: boolean;
  agentMode: AgentMode;
  selectedModelId: string;
  maxSteps: number;
  maxCostUsd: number;
  maxWallClockMs: number;
  persistedApprovals: string[];
};

export type AppSecrets = {
  anthropicApiKey: string;
  openaiApiKey: string;
};

export type LoadedSettings = AppSettings & { secrets: AppSecrets };
