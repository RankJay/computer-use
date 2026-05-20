import {
  DEFAULT_ANTHROPIC_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  isAnthropicModelId,
  isOpenAIModelId,
} from "@/agent/llm/modelCatalog";
import type { AppSettingsPayload, LlmApiProvider } from "@/agent/native/tauriIpc";
import { normalizePersistedApprovals } from "@/agent/toolContract";

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
    typeof value.uiAutomationEnabled === "boolean"
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
    typeof value.uiAutomationEnabled === "boolean"
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
  });
}

export function normalizeStoredSettings(parsed: unknown): AppSettingsPayload | null {
  if (isAppSettingsPayloadV2(parsed)) {
    return clampModelsForSave({
      ...parsed,
      activeApiProvider: parseActiveApiProvider(parsed.activeApiProvider),
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
