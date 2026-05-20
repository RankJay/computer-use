import { beforeEach, describe, expect, test } from "bun:test";

import { createHostRuntime, type HostRuntimeDependencies } from "@/agent/host/hostRuntime";
import { TAURI_COMMAND } from "@/agent/native/tauriIpc";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import { DEFAULT_APP_SETTINGS } from "@/agent/persistence/settingsCodec";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import type { TauriInvoke } from "@/agent/workspace/workspaceAdapter";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function createSettings(patch: Partial<AppSettingsPayload> = {}): AppSettingsPayload {
  return {
    ...DEFAULT_APP_SETTINGS,
    persistedApprovals: [...DEFAULT_APP_SETTINGS.persistedApprovals],
    ...patch,
  };
}

function installLocalStorage(storage: Storage): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function createTestRuntime(isDesktop: boolean, overrides: Partial<HostRuntimeDependencies> = {}) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke: TauriInvoke = async (command, args) => {
    calls.push({ command, args });
    if (command === TAURI_COMMAND.loadSettings) return null;
    if (command === TAURI_COMMAND.loadSecret) return null;
    return null;
  };
  const storage = new MemoryStorage();
  installLocalStorage(storage);

  const runtime = createHostRuntime({
    detectDesktop: () => isDesktop,
    invoke: overrides.invoke ?? invoke,
    localStorage: overrides.localStorage ?? (() => storage),
    createNativeBridge: overrides.createNativeBridge ?? (() => null),
    minimizeWindow: async () => {},
    startWindowDrag: () => {},
    ...overrides,
  });

  return { runtime, calls, storage };
}

describe("hostRuntime", () => {
  beforeEach(() => {
    installLocalStorage(new MemoryStorage());
  });

  test("web runtime disables terminal, UI automation, and disk session logs", () => {
    const { runtime } = createTestRuntime(false);

    expect(runtime.kind).toBe("web");
    expect(runtime.isDesktop).toBe(false);
    expect(runtime.canRunTerminal).toBe(false);
    expect(runtime.canRunUiAutomation).toBe(false);
    expect(runtime.canPersistSessionLogs).toBe(false);
    expect(runtime.native).toBeNull();
  });

  test("desktop runtime enables native capabilities", () => {
    const { runtime } = createTestRuntime(true);

    expect(runtime.kind).toBe("desktop");
    expect(runtime.canRunTerminal).toBe(true);
    expect(runtime.canRunUiAutomation).toBe(true);
    expect(runtime.canPersistSessionLogs).toBe(true);
  });

  test("web runtime fills sample workspace when settings have no root", () => {
    const { runtime } = createTestRuntime(false);

    expect(runtime.normalizeSettings(createSettings({ workspaceRoot: null })).workspaceRoot).toBe(
      BROWSER_SAMPLE_WORKSPACE_ROOT,
    );
    expect(runtime.resolveWorkspaceRoot(null, createSettings({ workspaceRoot: null }))).toBe(
      BROWSER_SAMPLE_WORKSPACE_ROOT,
    );
  });

  test("browser settings persist through localStorage", async () => {
    const { runtime } = createTestRuntime(false);
    const settings = createSettings({
      workspaceRoot: "d:/workspace",
      permissionMode: "ask_all",
      retentionDays: 7,
      agentMode: "demo",
      persistedApprovals: ["terminal.run"],
      uiAutomationEnabled: true,
    });

    await runtime.saveSettings(settings);
    expect(await runtime.loadSettings()).toEqual(settings);
  });

  test("desktop runtime invokes expected Tauri command names", async () => {
    const { runtime, calls } = createTestRuntime(true);
    const settings = createSettings({ workspaceRoot: "d:/workspace" });

    await runtime.saveSettings(settings);
    await runtime.loadSecret("anthropic");
    await runtime.storeSecret("anthropic", "key");
    await runtime.deleteSecret("anthropic");
    await runtime.appendSessionLogLine("session-1", '{"type":"task.created"}');
    await runtime.writeSessionKeyframe("session-1", "frame.png", "base64");
    await runtime.clearAllLogs();
    await runtime.openLogsFolder();

    expect(calls.map((call) => call.command)).toEqual([
      TAURI_COMMAND.saveSettings,
      TAURI_COMMAND.loadSecret,
      TAURI_COMMAND.storeSecret,
      TAURI_COMMAND.deleteSecret,
      TAURI_COMMAND.appendSessionLog,
      TAURI_COMMAND.writeSessionKeyframe,
      TAURI_COMMAND.clearAllLogs,
      TAURI_COMMAND.openLogsFolder,
    ]);
  });

  test("web runtime does not invoke session log commands", async () => {
    const { runtime, calls } = createTestRuntime(false);

    await runtime.appendSessionLogLine("session-1", '{"type":"task.created"}');
    await runtime.writeSessionKeyframe("session-1", "frame.png", "base64");
    await runtime.clearAllLogs();
    await runtime.openLogsFolder();

    expect(calls).toEqual([]);
  });
});
