import { describe, expect, test } from "bun:test";

import {
  DEFAULT_SETTINGS,
  mergeSettingsPatch,
  normalizeMaxWallClockMs,
  settingsOrDefault,
} from "@/lib/settings/defaults";

describe("settings defaults", () => {
  test("normalizeMaxWallClockMs treats legacy second values as seconds", () => {
    expect(normalizeMaxWallClockMs(900)).toBe(900_000);
    expect(normalizeMaxWallClockMs(900_000)).toBe(900_000);
    expect(normalizeMaxWallClockMs(0)).toBe(0);
  });

  test("settingsOrDefault normalizes stored wall clock values", () => {
    const settings = settingsOrDefault({ maxWallClockMs: 900 });
    expect(settings.maxWallClockMs).toBe(900_000);
  });

  test("mergeSettingsPatch overwrites provided fields", () => {
    const current = settingsOrDefault({ maxSteps: 50 });
    const merged = mergeSettingsPatch(current, { maxSteps: 10, logRetentionDays: 7 });

    expect(merged.maxSteps).toBe(10);
    expect(merged.logRetentionDays).toBe(7);
  });

  test("mergeSettingsPatch fills defaults for missing fields", () => {
    const current = settingsOrDefault({});
    const merged = mergeSettingsPatch(current, { workspaceRoot: "/tmp/work" });

    expect(merged.workspaceRoot).toBe("/tmp/work");
    expect(merged.maxSteps).toBe(DEFAULT_SETTINGS.maxSteps);
  });

  test("mergeSettingsPatch normalizes maxWallClockMs on merge", () => {
    const current = settingsOrDefault({});
    const merged = mergeSettingsPatch(current, { maxWallClockMs: 900 });

    expect(merged.maxWallClockMs).toBe(900_000);
  });
});
