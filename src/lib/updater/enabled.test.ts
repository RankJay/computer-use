import { describe, expect, test } from "bun:test";

import { isUpdaterEnabled, resolveUpdaterEnabled } from "@/lib/updater/enabled";

describe("resolveUpdaterEnabled", () => {
  test("false outside Tauri", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: false,
        isDev: false,
        viteUpdaterFlag: undefined,
        readActuateUpdaterEnv: async () => "1",
      }),
    ).toBe(false);
  });

  test("true in packaged Tauri builds", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: true,
        isDev: false,
        viteUpdaterFlag: undefined,
        readActuateUpdaterEnv: async () => {
          throw new Error("should not read env in packaged builds");
        },
      }),
    ).toBe(true);
  });

  test("true in Tauri dev when VITE_ACTUATE_UPDATER=1", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: true,
        isDev: true,
        viteUpdaterFlag: "1",
        readActuateUpdaterEnv: async () => {
          throw new Error("should not read env when vite flag is set");
        },
      }),
    ).toBe(true);
  });

  test("true in Tauri dev when ACTUATE_UPDATER=1", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: true,
        isDev: true,
        viteUpdaterFlag: undefined,
        readActuateUpdaterEnv: async () => "1",
      }),
    ).toBe(true);
  });

  test("false in Tauri dev when env unset", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: true,
        isDev: true,
        viteUpdaterFlag: undefined,
        readActuateUpdaterEnv: async () => null,
      }),
    ).toBe(false);
  });

  test("false in Tauri dev when env read fails", async () => {
    expect(
      await resolveUpdaterEnabled({
        isTauri: true,
        isDev: true,
        viteUpdaterFlag: undefined,
        readActuateUpdaterEnv: async () => {
          throw new Error("invoke failed");
        },
      }),
    ).toBe(false);
  });
});

describe("isUpdaterEnabled", () => {
  test("false outside Tauri (no window fixture)", async () => {
    expect(await isUpdaterEnabled()).toBe(false);
  });
});
