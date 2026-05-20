import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { detectDesktopHost } from "@/agent/host/detectDesktopHost";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { createNativeBridge } from "@/agent/native/nativeBridge";
import {
  TAURI_COMMAND,
  type AppSettingsPayload,
  type AppendSessionLogRequest,
  type DeleteSecretRequest,
  type LoadSecretRequest,
  type SaveSettingsRequest,
  type StoreSecretRequest,
  type WriteSessionKeyframeRequest,
} from "@/agent/native/tauriIpc";
import {
  clampModelsForSave,
  normalizeStoredSettings,
  settingsOrDefault,
} from "@/agent/persistence/settingsCodec";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import type { TauriInvoke } from "@/agent/workspace/workspaceAdapter";

export type HostRuntimeKind = "desktop" | "web";

export const BROWSER_SAMPLE_COMPOSER_PROMPT =
  "Use workspace.inspect on the workspace root, then read preset/actuate-sample.txt and summarize it in a few sentences.";

const WEB_SETTINGS_STORAGE_KEY = "actuate.settings.v1";

function webSecretStorageKey(secretId: string): string {
  return `actuate.secret.${secretId}`;
}

export type HostRuntime = {
  readonly kind: HostRuntimeKind;
  readonly isDesktop: boolean;
  readonly canRunTerminal: boolean;
  readonly canRunUiAutomation: boolean;
  readonly canPersistSessionLogs: boolean;
  readonly secretStorageLabel: string;
  readonly defaultComposerDraft: string;
  readonly native: AgentNativeBridge | null;
  normalizeSettings(payload: AppSettingsPayload | null): AppSettingsPayload;
  resolveWorkspaceRoot(
    workspaceOverride: string | null,
    settings: Pick<AppSettingsPayload, "workspaceRoot">,
  ): string | null;
  loadSettings(): Promise<AppSettingsPayload | null>;
  saveSettings(settings: AppSettingsPayload): Promise<void>;
  loadSecret(key: string): Promise<string | null>;
  storeSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  appendSessionLogLine(sessionId: string, line: string): Promise<void>;
  writeSessionKeyframe(sessionId: string, filename: string, pngBase64: string): Promise<void>;
  clearAllLogs(): Promise<void>;
  openLogsFolder(): Promise<void>;
  cancelPointerAutomation(): Promise<void>;
  minimizeWindow(): Promise<void>;
  startWindowDrag(): void;
  apiKeyReadFailureMessage(error: string): string;
  missingApiKeyFailureMessage(): string;
};

export type HostRuntimeDependencies = {
  readonly detectDesktop: () => boolean;
  readonly invoke: TauriInvoke;
  readonly localStorage: () => Storage | undefined;
  readonly createNativeBridge: () => AgentNativeBridge | null;
  readonly minimizeWindow: () => Promise<void>;
  readonly startWindowDrag: () => void;
};

const invokeTauri: TauriInvoke = (command, args) => invoke<unknown>(command, args);

function normalizeSettingsForHost(
  payload: AppSettingsPayload | null,
  isDesktop: boolean,
): AppSettingsPayload {
  const base = settingsOrDefault(payload);
  if (isDesktop || (base.workspaceRoot && base.workspaceRoot.trim() !== "")) {
    return base;
  }
  return { ...base, workspaceRoot: BROWSER_SAMPLE_WORKSPACE_ROOT };
}

function resolveWorkspaceRootForHost(
  workspaceOverride: string | null,
  settings: Pick<AppSettingsPayload, "workspaceRoot">,
  isDesktop: boolean,
): string | null {
  const workspaceRoot =
    workspaceOverride && workspaceOverride.trim().length > 0
      ? workspaceOverride.trim()
      : settings.workspaceRoot?.trim() || null;

  if (!workspaceRoot && !isDesktop) {
    return BROWSER_SAMPLE_WORKSPACE_ROOT;
  }

  return workspaceRoot;
}

export function createHostRuntime(deps: HostRuntimeDependencies): HostRuntime {
  const isDesktop = deps.detectDesktop();
  const kind: HostRuntimeKind = isDesktop ? "desktop" : "web";
  const native = deps.createNativeBridge();
  const secretStorageLabel = isDesktop ? "OS store" : "browser storage";

  return {
    kind,
    isDesktop,
    canRunTerminal: isDesktop,
    canRunUiAutomation: isDesktop,
    canPersistSessionLogs: isDesktop,
    secretStorageLabel,
    defaultComposerDraft: isDesktop ? "" : BROWSER_SAMPLE_COMPOSER_PROMPT,
    native,
    normalizeSettings: (payload) => normalizeSettingsForHost(payload, isDesktop),
    resolveWorkspaceRoot: (workspaceOverride, settings) =>
      resolveWorkspaceRootForHost(workspaceOverride, settings, isDesktop),
    loadSettings: async () => {
      if (!isDesktop) {
        const raw = deps.localStorage()?.getItem(WEB_SETTINGS_STORAGE_KEY) ?? null;
        if (!raw) return null;
        try {
          const parsed: unknown = JSON.parse(raw);
          return normalizeStoredSettings(parsed);
        } catch {
          return null;
        }
      }
      const loaded = await deps.invoke(TAURI_COMMAND.loadSettings);
      return normalizeStoredSettings(loaded);
    },
    saveSettings: async (settings) => {
      const normalized = clampModelsForSave(settings);
      if (!isDesktop) {
        deps.localStorage()?.setItem(WEB_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return;
      }
      const request: SaveSettingsRequest = { settings: normalized };
      await deps.invoke(TAURI_COMMAND.saveSettings, request);
    },
    loadSecret: async (key) => {
      if (!isDesktop) {
        return deps.localStorage()?.getItem(webSecretStorageKey(key)) ?? null;
      }
      const request: LoadSecretRequest = { key };
      const value = await deps.invoke(TAURI_COMMAND.loadSecret, request);
      return typeof value === "string" || value === null ? value : null;
    },
    storeSecret: async (key, value) => {
      if (!isDesktop) {
        deps.localStorage()?.setItem(webSecretStorageKey(key), value);
        return;
      }
      const request: StoreSecretRequest = { key, value };
      await deps.invoke(TAURI_COMMAND.storeSecret, request);
    },
    deleteSecret: async (key) => {
      if (!isDesktop) {
        deps.localStorage()?.removeItem(webSecretStorageKey(key));
        return;
      }
      const request: DeleteSecretRequest = { key };
      await deps.invoke(TAURI_COMMAND.deleteSecret, request);
    },
    appendSessionLogLine: async (sessionId, line) => {
      if (!isDesktop) return;
      const request: AppendSessionLogRequest = { sessionId, line };
      await deps.invoke(TAURI_COMMAND.appendSessionLog, request);
    },
    writeSessionKeyframe: async (sessionId, filename, pngBase64) => {
      if (!isDesktop) return;
      const request: WriteSessionKeyframeRequest = { sessionId, filename, pngBase64 };
      await deps.invoke(TAURI_COMMAND.writeSessionKeyframe, request);
    },
    clearAllLogs: async () => {
      if (!isDesktop) return;
      await deps.invoke(TAURI_COMMAND.clearAllLogs);
    },
    openLogsFolder: async () => {
      if (!isDesktop) return;
      await deps.invoke(TAURI_COMMAND.openLogsFolder);
    },
    cancelPointerAutomation: async () => {
      if (!isDesktop) return;
      await deps.invoke(TAURI_COMMAND.cancelPointerAutomation);
    },
    minimizeWindow: async () => {
      if (!isDesktop) return;
      await deps.minimizeWindow();
    },
    startWindowDrag: () => {
      if (!isDesktop) return;
      deps.startWindowDrag();
    },
    apiKeyReadFailureMessage: (error) =>
      isDesktop
        ? `Could not read API key from OS credential store: ${error}`
        : `Could not read API key from browser storage: ${error}`,
    missingApiKeyFailureMessage: () =>
      isDesktop
        ? "No API key found in the OS store. Open Settings and save an Anthropic or OpenAI key, then retry."
        : "No API key in browser storage. Open Settings and save an Anthropic or OpenAI key, then retry.",
  };
}

export const hostRuntime = createHostRuntime({
  detectDesktop: detectDesktopHost,
  invoke: invokeTauri,
  localStorage: () => globalThis.localStorage,
  createNativeBridge,
  minimizeWindow: () => getCurrentWindow().minimize(),
  startWindowDrag: () => {
    void getCurrentWindow().startDragging();
  },
});
