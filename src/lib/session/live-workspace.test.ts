import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { isLiveWorkspaceReady } from "./live-workspace";

describe("isLiveWorkspaceReady", () => {
  test("demo mode allows empty workspace", () => {
    expect(
      isLiveWorkspaceReady({ ...DEFAULT_SETTINGS, agentMode: "demo", workspaceRoot: "" }),
    ).toBe(true);
  });

  test("live mode rejects empty workspace", () => {
    expect(
      isLiveWorkspaceReady({ ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "" }),
    ).toBe(false);
    expect(
      isLiveWorkspaceReady({ ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "   " }),
    ).toBe(false);
  });

  test("live mode accepts configured workspace", () => {
    expect(
      isLiveWorkspaceReady({
        ...DEFAULT_SETTINGS,
        agentMode: "live",
        workspaceRoot: "D:/Projects/actuate-v3",
      }),
    ).toBe(true);
  });
});
