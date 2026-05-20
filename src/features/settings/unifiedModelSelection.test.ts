import { describe, expect, test } from "bun:test";

import { DEFAULT_APP_SETTINGS } from "@/agent/persistence/settingsCodec";
import {
  parseUnifiedModelOptionValue,
  unifiedModelOptionValue,
} from "@/features/settings/unifiedModelSelection";
import { resolveUnifiedModelSelectionSnapshot } from "@/features/settings/useUnifiedModelSelection";

describe("unifiedModelSelection", () => {
  test("round-trips provider and model id", () => {
    const value = unifiedModelOptionValue("anthropic", "claude-sonnet-4-6");

    expect(parseUnifiedModelOptionValue(value)).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
  });

  test("rejects malformed values", () => {
    expect(parseUnifiedModelOptionValue("no-separator")).toBeNull();
    expect(parseUnifiedModelOptionValue(":missing-provider")).toBeNull();
    expect(parseUnifiedModelOptionValue("unknown:model")).toBeNull();
  });

  test("chooses the active provider model when both keys are stored", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      activeApiProvider: "openai",
      anthropicModelId: "claude-sonnet-4-6",
      openaiModelId: "gpt-5.1",
    };

    expect(resolveUnifiedModelSelectionSnapshot(settings, true, true)).toEqual({
      effectiveProvider: "openai",
      unifiedModelSelectValue: unifiedModelOptionValue("openai", "gpt-5.1"),
    });
  });

  test("falls back to the only stored provider key", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      activeApiProvider: "openai",
      anthropicModelId: "claude-sonnet-4-6",
      openaiModelId: "gpt-5.1",
    };

    expect(resolveUnifiedModelSelectionSnapshot(settings, true, false)).toEqual({
      effectiveProvider: "anthropic",
      unifiedModelSelectValue: unifiedModelOptionValue("anthropic", "claude-sonnet-4-6"),
    });
  });

  test("does not select a model when no provider key is stored", () => {
    expect(resolveUnifiedModelSelectionSnapshot(DEFAULT_APP_SETTINGS, false, false)).toEqual({
      effectiveProvider: null,
      unifiedModelSelectValue: undefined,
    });
  });
});
