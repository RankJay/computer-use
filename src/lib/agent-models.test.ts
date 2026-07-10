import { describe, expect, test } from "bun:test";

import {
  getAgentModel,
  getDefaultAgentModel,
  getModelContextWindow,
  resolveAgentModelId,
} from "@/lib/agent-models";
import { estimateUsageCostUsd } from "@/lib/agent/model-usage";

describe("agent-models catalog", () => {
  test("every curated model has context window and pricing", () => {
    for (const model of [
      getDefaultAgentModel(),
      getAgentModel("openai/gpt-5.5"),
      getAgentModel("anthropic/claude-haiku-4-5"),
    ]) {
      expect(model).toBeDefined();
      expect(model!.contextWindowTokens).toBeGreaterThan(0);
      expect(model!.pricing.inputPerMillion).toBeGreaterThan(0);
      expect(model!.pricing.outputPerMillion).toBeGreaterThan(0);
    }
  });

  test("resolveAgentModelId falls back to default for unknown ids", () => {
    expect(resolveAgentModelId("openai/unknown")).toBe(getDefaultAgentModel().id);
    expect(resolveAgentModelId("openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });

  test("getModelContextWindow returns catalog values", () => {
    expect(getModelContextWindow("openai/gpt-5.5")).toBe(1_000_000);
    expect(getModelContextWindow("openai/gpt-5.4-mini")).toBe(400_000);
    expect(getModelContextWindow("anthropic/claude-sonnet-4-5")).toBe(200_000);
  });
});

describe("model usage cost estimation", () => {
  test("estimates input and output cost from published rates", () => {
    const cost = estimateUsageCostUsd("openai/gpt-5.4-mini", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(cost.inputUsd).toBeCloseTo(0.75, 5);
    expect(cost.outputUsd).toBeCloseTo(4.5, 5);
    expect(cost.totalUsd).toBeCloseTo(5.25, 5);
  });

  test("uses cached-input rate when provided", () => {
    const cost = estimateUsageCostUsd("anthropic/claude-haiku-4-5", {
      cacheReadTokens: 1_000_000,
    });

    expect(cost.cacheReadUsd).toBeCloseTo(0.1, 5);
    expect(cost.totalUsd).toBeCloseTo(0.1, 5);
  });
});
