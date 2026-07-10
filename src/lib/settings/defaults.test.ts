import { describe, expect, test } from "bun:test";

import { normalizeMaxWallClockMs, settingsOrDefault } from "@/lib/settings/defaults";

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
});
