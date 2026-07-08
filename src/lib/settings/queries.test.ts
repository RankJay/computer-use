import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, mergeSettingsPatch, settingsOrDefault } from "@/lib/settings/defaults";
import type { AppSettings, LoadedSettings } from "@/lib/settings/types";

function stripSecrets(settings: LoadedSettings): AppSettings {
  const { secrets: _secrets, ...appSettings } = settings;
  return appSettings;
}

function applySettingsPatch(
  current: LoadedSettings,
  patch: Partial<AppSettings>,
): LoadedSettings {
  const nextSettings = mergeSettingsPatch(stripSecrets(current), patch);
  return { ...nextSettings, secrets: current.secrets };
}

describe("settings mutation cache shape", () => {
  test("applySettingsPatch preserves secrets when updating app settings", () => {
    const current: LoadedSettings = {
      ...settingsOrDefault({ workspaceRoot: "/tmp/work", maxSteps: 25 }),
      secrets: {
        anthropicApiKey: "sk-ant-test",
        openaiApiKey: "sk-test",
      },
    };

    const next = applySettingsPatch(current, { maxSteps: 10 });

    expect(next.maxSteps).toBe(10);
    expect(next.workspaceRoot).toBe("/tmp/work");
    expect(next.secrets).toEqual(current.secrets);
  });

  test("applySettingsPatch keeps default secrets when none were loaded", () => {
    const current: LoadedSettings = {
      ...settingsOrDefault({}),
      secrets: { ...DEFAULT_SECRETS },
    };

    const next = applySettingsPatch(current, { logRetentionDays: 14 });

    expect(next.logRetentionDays).toBe(14);
    expect(next.secrets).toEqual(DEFAULT_SECRETS);
  });
});
