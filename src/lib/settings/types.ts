import { z } from "zod";

export const permissionModeSchema = z.enum([
  "risky",
  "every-meaningful",
  "destructive-only",
  "once-per-class",
]);

export type PermissionMode = z.infer<typeof permissionModeSchema>;

export const agentModeSchema = z.enum(["live", "demo"]);

export type AgentMode = z.infer<typeof agentModeSchema>;

/** Label/value pair for settings `<Select>` options. */
export type SettingsSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export const appSettingsSchema = z.object({
  workspaceRoot: z.string(),
  logRetentionDays: z.number(),
  permissionMode: permissionModeSchema,
  uiAutomation: z.boolean(),
  agentMode: agentModeSchema,
  selectedModelId: z.string(),
  maxSteps: z.number(),
  maxCostUsd: z.number(),
  maxWallClockMs: z.number(),
  persistedApprovals: z.array(z.string()),
  /** When true, verified updates apply on quit with no ready dialog. */
  installUpdateOnClose: z.boolean(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const appSecretsSchema = z.object({
  anthropicApiKey: z.string(),
  openaiApiKey: z.string(),
});

export type AppSecrets = z.infer<typeof appSecretsSchema>;

export type LoadedSettings = AppSettings & { secrets: AppSecrets };

/** Loose partial for disk merge before defaults fill. */
export const appSettingsPartialSchema = appSettingsSchema.partial();
