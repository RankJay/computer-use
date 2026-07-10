import type { LanguageModelUsage } from "ai";

import {
  getAgentModel,
  getDefaultAgentModel,
  type AgentModelOption,
  type ModelPricing,
} from "@/lib/agent-models";

export type UsageCostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  reasoningUsd: number;
  cacheReadUsd: number;
  totalUsd: number;
};

type TokenUsageInput = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
};

function tokensToUsd(tokens: number, pricePerMillion: number): number {
  if (tokens <= 0) {
    return 0;
  }
  return (tokens / 1_000_000) * pricePerMillion;
}

function resolvePricing(model: AgentModelOption): ModelPricing {
  return model.pricing;
}

export function estimateUsageCostUsd(modelId: string, usage: TokenUsageInput): UsageCostBreakdown {
  const model = getAgentModel(modelId) ?? getDefaultAgentModel();
  const pricing = resolvePricing(model);

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = usage.reasoningTokens ?? 0;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;

  const inputUsd = tokensToUsd(inputTokens, pricing.inputPerMillion);
  const outputUsd = tokensToUsd(outputTokens, pricing.outputPerMillion);
  const reasoningUsd = tokensToUsd(reasoningTokens, pricing.outputPerMillion);
  const cacheReadUsd = tokensToUsd(
    cacheReadTokens,
    pricing.cachedInputPerMillion ?? pricing.inputPerMillion * 0.1,
  );

  return {
    inputUsd,
    outputUsd,
    reasoningUsd,
    cacheReadUsd,
    totalUsd: inputUsd + outputUsd + reasoningUsd + cacheReadUsd,
  };
}

export function estimateLanguageModelUsageCostUsd(
  modelId: string,
  usage: LanguageModelUsage,
): UsageCostBreakdown {
  return estimateUsageCostUsd(modelId, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
  });
}
