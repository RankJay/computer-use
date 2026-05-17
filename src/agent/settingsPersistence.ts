import { invoke } from "@tauri-apps/api/core";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import { isTauriRuntime } from "@/agent/nativeBridge";
import { TAURI_COMMAND, type AppSettingsPayload } from "@/agent/tauriIpc";

const WEB_SETTINGS_STORAGE_KEY = "actuate.settings.v1";

export const DEFAULT_APP_SETTINGS: AppSettingsPayload = {
  workspaceRoot: null,
  permissionMode: "ask_risky",
  retentionDays: 30,
  modelId: "claude-sonnet-4-20250514",
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

function isAppSettingsPayload(value: unknown): value is AppSettingsPayload {
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
      return isAppSettingsPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return invoke<AppSettingsPayload>(TAURI_COMMAND.loadSettings);
}

export async function saveAppSettings(settings: AppSettingsPayload): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.setItem(WEB_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return;
  }
  await invoke(TAURI_COMMAND.saveSettings, { settings });
}
