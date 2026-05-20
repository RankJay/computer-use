import { beforeEach, describe, expect, test } from "bun:test";

import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  settingsForRuntime,
  settingsOrDefault,
} from "@/agent/persistence/settingsPersistence";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";

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

function installLocalStorage(storage: Storage): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

function createSettings(patch: Partial<AppSettingsPayload> = {}): AppSettingsPayload {
  return {
    ...DEFAULT_APP_SETTINGS,
    persistedApprovals: [...DEFAULT_APP_SETTINGS.persistedApprovals],
    ...patch,
  };
}

describe("settingsPersistence", () => {
  beforeEach(() => {
    installLocalStorage(new MemoryStorage());
  });

  test("settingsOrDefault returns the existing default payload", () => {
    expect(settingsOrDefault(null)).toEqual(DEFAULT_APP_SETTINGS);
  });

  test("browser settings persist through localStorage", async () => {
    const settings = createSettings({
      workspaceRoot: "d:/workspace",
      permissionMode: "ask_all",
      retentionDays: 7,
      agentMode: "demo",
      persistedApprovals: ["terminal.run"],
      uiAutomationEnabled: true,
    });

    await saveAppSettings(settings);

    expect(await loadAppSettings()).toEqual(settings);
  });

  test("load migrates legacy snake_case persisted approvals to contract ids", async () => {
    installLocalStorage(new MemoryStorage());
    globalThis.localStorage.setItem(
      "actuate.settings.v1",
      JSON.stringify(
        createSettings({
          persistedApprovals: ["terminal_run", "read_file", "bogus"],
        }),
      ),
    );

    expect(await loadAppSettings()).toEqual(
      createSettings({
        persistedApprovals: ["terminal.run", "file.read"],
      }),
    );
  });

  test("browser runtime fills the sample workspace when settings have no root", () => {
    expect(settingsForRuntime(createSettings({ workspaceRoot: null }), false).workspaceRoot).toBe(
      BROWSER_SAMPLE_WORKSPACE_ROOT,
    );
  });
});
