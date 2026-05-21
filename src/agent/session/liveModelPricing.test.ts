import { describe, expect, test } from "bun:test";

import {
  estimateLiveUsageCostUsd,
  liveModelIdsMissingPricing,
} from "@/agent/session/liveModelPricing";

describe("liveModelPricing", () => {
  test("covers every registered live model", () => {
    expect(liveModelIdsMissingPricing()).toEqual([]);
  });

  test("prices live usage with cached input tokens", () => {
    expect(
      estimateLiveUsageCostUsd(
        {
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadInputTokens: 400,
          cacheWriteInputTokens: 100,
        },
        "anthropic",
        "claude-sonnet-4-6",
      ),
    ).toBeCloseTo(0.004995);
  });
});
