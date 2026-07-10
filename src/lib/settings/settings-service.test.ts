import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import type { SettingsPersistence } from "@/lib/settings/ports";
import { createSettingsService } from "@/lib/settings/settings-service";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

function createMemoryPersistence(initial?: Partial<LoadedSettings>): SettingsPersistence {
  let settings: AppSettings = { ...DEFAULT_SETTINGS, ...initial };
  let secrets: AppSecrets = { ...DEFAULT_SECRETS, ...initial?.secrets };

  return {
    async load() {
      return { ...settings, secrets: { ...secrets } };
    },
    async saveSettings(next) {
      settings = { ...next };
    },
    async saveSecret(key, value) {
      secrets = { ...secrets, [key]: value };
    },
  };
}

describe("settings-service", () => {
  test("initSettings loads from persistence", async () => {
    const service = createSettingsService(
      createMemoryPersistence({ workspaceRoot: "/tmp/work", secrets: { openaiApiKey: "sk-test" } }),
    );

    const loaded = await service.initSettings();

    expect(loaded.workspaceRoot).toBe("/tmp/work");
    expect(loaded.secrets.openaiApiKey).toBe("sk-test");
  });

  test("saveSettings merges patch and persists non-secrets only", async () => {
    const persistence = createMemoryPersistence({
      secrets: { anthropicApiKey: "sk-ant-test" },
    });
    const service = createSettingsService(persistence);
    await service.initSettings();

    const next = await service.saveSettings({ maxSteps: 10, logRetentionDays: 7 });

    expect(next.maxSteps).toBe(10);
    expect(next.logRetentionDays).toBe(7);
    expect(next.secrets.anthropicApiKey).toBe("sk-ant-test");

    const reloaded = await persistence.load();
    expect(reloaded.maxSteps).toBe(10);
    expect(reloaded.secrets.anthropicApiKey).toBe("sk-ant-test");
  });

  test("saveSecret updates secrets without touching app settings", async () => {
    const persistence = createMemoryPersistence({ agentMode: "demo" });
    const service = createSettingsService(persistence);
    await service.initSettings();

    const next = await service.saveSecret("openaiApiKey", "sk-openai");

    expect(next.agentMode).toBe("demo");
    expect(next.secrets.openaiApiKey).toBe("sk-openai");

    const reloaded = await persistence.load();
    expect(reloaded.agentMode).toBe("demo");
    expect(reloaded.secrets.openaiApiKey).toBe("sk-openai");
  });
});
