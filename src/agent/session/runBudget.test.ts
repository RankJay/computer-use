import { describe, expect, test } from "bun:test";

import {
  createRunBudgetProgress,
  estimateStepCostUsd,
  exceededBudgetLimit,
} from "@/agent/session/runBudget";
import type { RunBudget } from "@/agent/types";

const budget: RunBudget = {
  maxSteps: 2,
  maxCostUsd: 0.01,
  maxWallClockMs: 1000,
};

describe("runBudget", () => {
  test("trips at the configured step budget", () => {
    const progress = createRunBudgetProgress({
      budget,
      steps: [{}, {}],
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      startedAt: 1000,
      now: 1200,
    });

    expect(exceededBudgetLimit(progress)).toBe("maxSteps");
  });

  test("trips at the configured cost budget", () => {
    const progress = createRunBudgetProgress({
      budget,
      steps: [
        {
          usage: {
            inputTokens: 1_000_000,
            outputTokens: 0,
          },
        },
      ],
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      startedAt: 1000,
      now: 1200,
    });

    expect(progress.costUsd).toBe(3);
    expect(exceededBudgetLimit(progress)).toBe("maxCostUsd");
  });

  test("trips at the configured wall-clock budget", () => {
    const progress = createRunBudgetProgress({
      budget,
      steps: [{}],
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      startedAt: 1000,
      now: 2200,
    });

    expect(exceededBudgetLimit(progress)).toBe("maxWallClockMs");
  });

  test("prices cached input tokens separately when the model has cache pricing", () => {
    expect(
      estimateStepCostUsd(
        {
          usage: {
            inputTokens: 1000,
            inputTokenDetails: {
              cacheReadTokens: 400,
              cacheWriteTokens: 100,
            },
            outputTokens: 200,
          },
        },
        "anthropic",
        "claude-sonnet-4-6",
      ),
    ).toBeCloseTo(0.004995);
  });
});
