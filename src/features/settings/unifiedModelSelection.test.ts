import { describe, expect, test } from "bun:test";

import {
  parseUnifiedModelOptionValue,
  unifiedModelOptionValue,
} from "@/features/settings/unifiedModelSelection";

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
  });
});
