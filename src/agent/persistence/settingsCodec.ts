import {
  DEFAULT_ANTHROPIC_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  isAnthropicModelId,
  isOpenAIModelId,
} from "@/agent/llm/modelCatalog";
import type { AppSettingsPayload, LlmApiProvider } from "@/agent/native/tauriIpc";
import { normalizePersistedApprovals } from "@/agent/toolContract";
import type { RunBudget } from "@/agent/types";

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxSteps: 28,
  maxCostUsd: 1,
  maxWallClockMs: 10 * 60 * 1000,
};

export const DEFAULT_APP_SETTINGS: AppSettingsPayload = {
  workspaceRoot: null,
  permissionMode: "ask_risky",
  retentionDays: 30,
  anthropicModelId: DEFAULT_ANTHROPIC_MODEL_ID,
  openaiModelId: DEFAULT_OPENAI_MODEL_ID,
  activeApiProvider: "anthropic",
  agentMode: "live",
  persistedApprovals: [],
  uiAutomationEnabled: false,
  runBudgetDefaults: DEFAULT_RUN_BUDGET,
};

function hasKey<K extends string>(value: object, key: K): value is { readonly [P in K]: unknown } {
  return key in value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string");
}

function parseActiveApiProvider(value: unknown): LlmApiProvider {
  return value === "openai" ? "openai" : "anthropic";
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRunBudget(value: unknown): value is RunBudget {
  if (typeof value !== "object" || value === null) return false;
  if (
    !hasKey(value, "maxSteps") ||
    !hasKey(value, "maxCostUsd") ||
    !hasKey(value, "maxWallClockMs")
  ) {
    return false;
  }
  return (
    isPositiveFiniteNumber(value.maxSteps) &&
    isPositiveFiniteNumber(value.maxCostUsd) &&
    isPositiveFiniteNumber(value.maxWallClockMs)
  );
}

export function normalizeRunBudget(value: unknown): RunBudget {
  if (!isRunBudget(value)) {
    return DEFAULT_RUN_BUDGET;
  }
  return {
    maxSteps: Math.max(1, Math.floor(value.maxSteps)),
    maxCostUsd: value.maxCostUsd,
    maxWallClockMs: Math.max(1, Math.floor(value.maxWallClockMs)),
  };
}

export function clampModelsForSave(payload: AppSettingsPayload): AppSettingsPayload {
  const anthropicModelId = isAnthropicModelId(payload.anthropicModelId)
    ? payload.anthropicModelId
    : DEFAULT_ANTHROPIC_MODEL_ID;
  const openaiModelId = isOpenAIModelId(payload.openaiModelId)
    ? payload.openaiModelId
    : DEFAULT_OPENAI_MODEL_ID;
  return {
    ...payload,
    anthropicModelId,
    openaiModelId,
    persistedApprovals: normalizePersistedApprovals(payload.persistedApprovals),
    runBudgetDefaults: normalizeRunBudget(payload.runBudgetDefaults),
  };
}

function isAppSettingsPayloadV2(value: unknown): value is AppSettingsPayload {
  if (typeof value !== "object" || value === null) return false;
  if (
    !hasKey(value, "workspaceRoot") ||
    !hasKey(value, "permissionMode") ||
    !hasKey(value, "retentionDays") ||
    !hasKey(value, "anthropicModelId") ||
    !hasKey(value, "openaiModelId") ||
    !hasKey(value, "activeApiProvider") ||
    !hasKey(value, "agentMode") ||
    !hasKey(value, "persistedApprovals") ||
    !hasKey(value, "uiAutomationEnabled")
  ) {
    return false;
  }

  return (
    (typeof value.workspaceRoot === "string" || value.workspaceRoot === null) &&
    typeof value.permissionMode === "string" &&
    typeof value.retentionDays === "number" &&
    typeof value.anthropicModelId === "string" &&
    typeof value.openaiModelId === "string" &&
    typeof value.activeApiProvider === "string" &&
    typeof value.agentMode === "string" &&
    isStringArray(value.persistedApprovals) &&
    typeof value.uiAutomationEnabled === "boolean" &&
    (!hasKey(value, "runBudgetDefaults") || isRunBudget(value.runBudgetDefaults))
  );
}

/** Legacy payload shape before dual-provider settings. */
function isLegacyAppSettingsPayload(value: unknown): value is {
  workspaceRoot: string | null;
  permissionMode: string;
  retentionDays: number;
  modelId: string;
  agentMode: string;
  persistedApprovals: string[];
  uiAutomationEnabled: boolean;
  runBudgetDefaults?: RunBudget;
} {
  if (typeof value !== "object" || value === null) return false;
  if (
    !hasKey(value, "workspaceRoot") ||
    !hasKey(value, "permissionMode") ||
    !hasKey(value, "retentionDays") ||
    !hasKey(value, "modelId") ||
    !hasKey(value, "agentMode") ||
    !hasKey(value, "persistedApprovals") ||
    !hasKey(value, "uiAutomationEnabled")
  ) {
    return false;
  }
  return (
    (typeof value.workspaceRoot === "string" || value.workspaceRoot === null) &&
    typeof value.permissionMode === "string" &&
    typeof value.retentionDays === "number" &&
    typeof value.modelId === "string" &&
    typeof value.agentMode === "string" &&
    isStringArray(value.persistedApprovals) &&
    typeof value.uiAutomationEnabled === "boolean" &&
    (!hasKey(value, "runBudgetDefaults") || isRunBudget(value.runBudgetDefaults))
  );
}

function migrateLegacyToV2(legacy: {
  workspaceRoot: string | null;
  permissionMode: string;
  retentionDays: number;
  modelId: string;
  agentMode: string;
  persistedApprovals: string[];
  uiAutomationEnabled: boolean;
  runBudgetDefaults?: RunBudget;
}): AppSettingsPayload {
  const migratedAnthropicId = isAnthropicModelId(legacy.modelId)
    ? legacy.modelId
    : DEFAULT_ANTHROPIC_MODEL_ID;
  return clampModelsForSave({
    ...DEFAULT_APP_SETTINGS,
    workspaceRoot: legacy.workspaceRoot,
    permissionMode: legacy.permissionMode,
    retentionDays: legacy.retentionDays,
    anthropicModelId: migratedAnthropicId,
    openaiModelId: DEFAULT_OPENAI_MODEL_ID,
    activeApiProvider: "anthropic",
    agentMode: legacy.agentMode,
    persistedApprovals: [...legacy.persistedApprovals],
    uiAutomationEnabled: legacy.uiAutomationEnabled,
    runBudgetDefaults: normalizeRunBudget(legacy.runBudgetDefaults),
  });
}

export function normalizeStoredSettings(parsed: unknown): AppSettingsPayload | null {
  if (isAppSettingsPayloadV2(parsed)) {
    return clampModelsForSave({
      ...parsed,
      activeApiProvider: parseActiveApiProvider(parsed.activeApiProvider),
      runBudgetDefaults: normalizeRunBudget(parsed.runBudgetDefaults),
    });
  }
  if (isLegacyAppSettingsPayload(parsed)) {
    return migrateLegacyToV2(parsed);
  }
  return null;
}

export function settingsOrDefault(payload: AppSettingsPayload | null): AppSettingsPayload {
  return (
    payload ?? {
      ...DEFAULT_APP_SETTINGS,
      persistedApprovals: [...DEFAULT_APP_SETTINGS.persistedApprovals],
    }
  );
}
