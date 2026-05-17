import { invoke } from "@tauri-apps/api/core";
import {
  browserSampleFileUrl,
  isBrowserSampleWorkspace,
  listBrowserSampleChildren,
} from "@/agent/browserWorkspace";
import { isTauriRuntime } from "@/agent/nativeBridge";
import { TAURI_COMMAND, type AppSettingsPayload } from "@/agent/tauriIpc";
import type { AgentEvent } from "@/agent/types";

const WEB_SETTINGS_STORAGE_KEY = "actuate.settings.v1";

function webSecretStorageKey(secretId: string): string {
  return `actuate.secret.${secretId}`;
}

export function settingsOrDefault(payload: AppSettingsPayload | null): AppSettingsPayload {
  if (payload) return payload;
  return {
    workspaceRoot: null,
    permissionMode: "ask_risky",
    retentionDays: 30,
    modelId: "claude-sonnet-4-20250514",
    agentMode: "live",
    persistedApprovals: [],
    uiAutomationEnabled: false,
  };
}

export async function loadAppSettings(): Promise<AppSettingsPayload | null> {
  if (!isTauriRuntime()) {
    const raw = globalThis.localStorage?.getItem(WEB_SETTINGS_STORAGE_KEY) ?? null;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AppSettingsPayload;
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

export async function loadSecretKey(key: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return globalThis.localStorage?.getItem(webSecretStorageKey(key)) ?? null;
  }
  return invoke<string | null>(TAURI_COMMAND.loadSecret, { key });
}

export async function storeSecretKey(key: string, value: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.setItem(webSecretStorageKey(key), value);
    return;
  }
  await invoke(TAURI_COMMAND.storeSecret, { key, value });
}

export async function deleteSecretKey(key: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.removeItem(webSecretStorageKey(key));
    return;
  }
  await invoke(TAURI_COMMAND.deleteSecret, { key });
}

export function eventForDiskLog(event: AgentEvent): Record<string, unknown> {
  const base: Record<string, unknown> = { ...event };
  if (event.type === "screenshot.keyframe" && "imageBase64" in base) {
    base.imageBase64Redacted = true;
    delete base.imageBase64;
  }
  return base;
}

export async function appendSessionLogLine(sessionId: string, event: AgentEvent): Promise<void> {
  if (!isTauriRuntime()) return;
  const line = JSON.stringify(eventForDiskLog(event));
  await invoke(TAURI_COMMAND.appendSessionLog, { sessionId, line });
}

export async function persistKeyframePng(
  sessionId: string,
  filename: string,
  pngBase64: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.writeSessionKeyframe, {
    sessionId,
    filename,
    pngBase64,
  });
}

export async function clearAllLogs(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.clearAllLogs);
}

export async function openLogsFolder(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.openLogsFolder);
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    if (!isBrowserSampleWorkspace(workspaceRoot)) {
      throw new Error(
        "Web build only reads the bundled sample workspace. Use the default workspace or the desktop app for a real folder.",
      );
    }
    const url = browserSampleFileUrl(relativePath);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to read ${relativePath} (${res.status}).`);
    }
    return await res.text();
  }
  return invoke<string>(TAURI_COMMAND.readWorkspaceFile, {
    workspaceRoot,
    relativePath,
  });
}

export async function listWorkspaceDirectory(
  workspaceRoot: string,
  relativeDir: string,
): Promise<string[]> {
  if (!isTauriRuntime()) {
    if (!isBrowserSampleWorkspace(workspaceRoot)) {
      throw new Error(
        "Web build only lists the bundled sample workspace. Use the desktop app to browse a real folder.",
      );
    }
    return listBrowserSampleChildren(relativeDir);
  }
  return invoke<string[]>(TAURI_COMMAND.listWorkspaceDir, {
    workspaceRoot,
    relativeDir,
  });
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Writing workspace files requires the Tauri desktop app.");
  }
  return invoke<string>(TAURI_COMMAND.writeWorkspaceFile, {
    workspaceRoot,
    relativePath,
    content,
  });
}
