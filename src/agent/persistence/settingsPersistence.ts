import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_ANTHROPIC_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  isAnthropicModelId,
  isOpenAIModelId,
} from "@/agent/llm/modelCatalog";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import { isTauriRuntime } from "@/agent/native/nativeBridge";
import type { AppSettingsPayload, LlmApiProvider } from "@/agent/native/tauriIpc";
import { TAURI_COMMAND } from "@/agent/native/tauriIpc";

const WEB_SETTINGS_STORAGE_KEY = "actuate.settings.v1";

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

function clampModels(payload: AppSettingsPayload): AppSettingsPayload {
  const anthropicModelId = isAnthropicModelId(payload.anthropicModelId)
    ? payload.anthropicModelId
    : DEFAULT_ANTHROPIC_MODEL_ID;
  const openaiModelId = isOpenAIModelId(payload.openaiModelId)
    ? payload.openaiModelId
    : DEFAULT_OPENAI_MODEL_ID;
  return { ...payload, anthropicModelId, openaiModelId };
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
  return clampModels({
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

function normalizeStoredSettings(parsed: unknown): AppSettingsPayload | null {
  if (isAppSettingsPayloadV2(parsed)) {
    return clampModels({
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

export function settingsForRuntime(
  payload: AppSettingsPayload | null,
  tauriRuntime = isTauriRuntime(),
): AppSettingsPayload {
  const base = settingsOrDefault(payload);
  if (tauriRuntime || (base.workspaceRoot && base.workspaceRoot.trim() !== "")) {
    return base;
  }
  return { ...base, workspaceRoot: BROWSER_SAMPLE_WORKSPACE_ROOT };
}

export async function loadAppSettings(): Promise<AppSettingsPayload | null> {
  if (!isTauriRuntime()) {
    const raw = globalThis.localStorage?.getItem(WEB_SETTINGS_STORAGE_KEY) ?? null;
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return normalizeStoredSettings(parsed);
    } catch {
      return null;
    }
  }
  const loaded = await invoke<unknown>(TAURI_COMMAND.loadSettings);
  return normalizeStoredSettings(loaded);
}

export async function saveAppSettings(settings: AppSettingsPayload): Promise<void> {
  const normalized = clampModels({
    ...settings,
    activeApiProvider: parseActiveApiProvider(settings.activeApiProvider),
  });
  if (!isTauriRuntime()) {
    globalThis.localStorage?.setItem(WEB_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    return;
  }
  await invoke(TAURI_COMMAND.saveSettings, { settings: normalized });
}
