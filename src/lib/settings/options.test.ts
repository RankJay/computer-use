import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "./defaults";
import {
  parseAgentMode,
  parsePermissionMode,
  wallClockMinutesFromMs,
  wallClockMsFromMinutes,
} from "./options";
import {
  selectAgentMode,
  selectHasPersistedApprovals,
  selectHasProviderApiKey,
  selectHasWorkspaceRoot,
  selectMaxSteps,
  selectPermissionMode,
  selectSecretIsSaved,
  selectSelectedModelId,
  selectSetupProgress,
  selectWorkspaceRoot,
} from "./selectors";
import type { LoadedSettings } from "./types";

describe("settings options", () => {
  test("parseAgentMode falls back to live", () => {
    expect(parseAgentMode("demo")).toBe("demo");
    expect(parseAgentMode("nope")).toBe("live");
  });

  test("parsePermissionMode falls back to risky", () => {
    expect(parsePermissionMode("destructive-only")).toBe("destructive-only");
    expect(parsePermissionMode("nope")).toBe("risky");
  });

  test("wall clock minutes ↔ ms round-trip preserves unlimited zero", () => {
    expect(wallClockMinutesFromMs(0)).toBe("0");
    expect(wallClockMsFromMinutes(0)).toBe(0);
    expect(wallClockMsFromMinutes(5)).toBe(300_000);
    expect(wallClockMinutesFromMs(300_000)).toBe("5");
  });
});

describe("settings selectors", () => {
  const loaded: LoadedSettings = {
    ...DEFAULT_SETTINGS,
    workspaceRoot: "/tmp/work",
    secrets: { ...DEFAULT_SECRETS, openaiApiKey: "sk-x", anthropicApiKey: "" },
    persistedApprovals: ["read_file"],
  };

  test("selects core fields", () => {
    expect(selectWorkspaceRoot(loaded)).toBe(loaded.workspaceRoot);
    expect(selectAgentMode(loaded)).toBe(loaded.agentMode);
    expect(selectPermissionMode(loaded)).toBe(loaded.permissionMode);
    expect(selectSelectedModelId(loaded)).toBe(loaded.selectedModelId);
    expect(selectMaxSteps(loaded)).toBe(loaded.maxSteps);
    expect(selectHasPersistedApprovals(loaded)).toBe(true);
  });

  test("secret saved selectors", () => {
    expect(selectSecretIsSaved.openaiApiKey(loaded)).toBe(true);
    expect(selectSecretIsSaved.anthropicApiKey(loaded)).toBe(false);
  });

  test("setup progress: workspace + either provider key", () => {
    expect(selectHasWorkspaceRoot(loaded)).toBe(true);
    expect(selectHasProviderApiKey(loaded)).toBe(true);
    expect(selectSetupProgress(loaded)).toEqual({
      workspaceDone: true,
      apiKeyDone: true,
      incomplete: false,
    });

    const empty: LoadedSettings = {
      ...DEFAULT_SETTINGS,
      secrets: { ...DEFAULT_SECRETS },
    };
    expect(selectSetupProgress(empty)).toEqual({
      workspaceDone: false,
      apiKeyDone: false,
      incomplete: true,
    });

    const anthropicOnly: LoadedSettings = {
      ...DEFAULT_SETTINGS,
      workspaceRoot: "  ",
      secrets: { ...DEFAULT_SECRETS, anthropicApiKey: "sk-ant-x" },
    };
    expect(selectHasWorkspaceRoot(anthropicOnly)).toBe(false);
    expect(selectHasProviderApiKey(anthropicOnly)).toBe(true);
    expect(selectSetupProgress(anthropicOnly).incomplete).toBe(true);
  });
});
