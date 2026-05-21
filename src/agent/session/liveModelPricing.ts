import { ANTHROPIC_MODEL_OPTIONS, OPENAI_MODEL_OPTIONS } from "@/agent/llm/modelCatalog";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";

export type ModelTokenPrice = {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly cacheReadUsdPerMillion?: number;
  readonly cacheWriteUsdPerMillion?: number;
};

export type PricedTokenUsage = {
  readonly inputTokens?: number;
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
  readonly outputTokens?: number;
};

export type LiveUsageTokens = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheWriteInputTokens: number;
};

const ANTHROPIC_PRICES: Readonly<Record<string, ModelTokenPrice>> = {
  "claude-haiku-4-5": { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 },
  "claude-sonnet-4-6": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheReadUsdPerMillion: 0.3,
    cacheWriteUsdPerMillion: 3.75,
  },
  "claude-opus-4-7": {
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
    cacheReadUsdPerMillion: 1.5,
    cacheWriteUsdPerMillion: 18.75,
  },
};

const OPENAI_PRICES: Readonly<Record<string, ModelTokenPrice>> = {
  "gpt-5.2": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  "gpt-4o": { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  "gpt-4o-mini": { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
};

export function liveModelPriceFor(
  provider: LlmApiProvider,
  modelId: string,
): ModelTokenPrice | null {
  const catalog = provider === "anthropic" ? ANTHROPIC_PRICES : OPENAI_PRICES;
  return catalog[modelId] ?? null;
}

export function liveModelIdsMissingPricing(): readonly string[] {
  const missingAnthropic = ANTHROPIC_MODEL_OPTIONS.filter(
    (model) => liveModelPriceFor("anthropic", model.id) === null,
  ).map((model) => model.id);
  const missingOpenAI = OPENAI_MODEL_OPTIONS.filter(
    (model) => liveModelPriceFor("openai", model.id) === null,
  ).map((model) => model.id);

  return [...missingAnthropic, ...missingOpenAI];
}

export function estimatePricedTokenUsageCostUsd(
  usage: PricedTokenUsage,
  provider: LlmApiProvider,
  modelId: string,
): number {
  const price = liveModelPriceFor(provider, modelId);
  if (price === null) {
    return 0;
  }

  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens;
  const cachedInputTokens = (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
  const inputTokens = Math.max((usage.inputTokens ?? 0) - cachedInputTokens, 0);

  return (
    pricedTokens(inputTokens, price.inputUsdPerMillion) +
    pricedTokens(usage.outputTokens, price.outputUsdPerMillion) +
    pricedTokens(cacheReadTokens, price.cacheReadUsdPerMillion ?? price.inputUsdPerMillion) +
    pricedTokens(cacheWriteTokens, price.cacheWriteUsdPerMillion ?? price.inputUsdPerMillion)
  );
}

export function estimateLiveUsageCostUsd(
  usage: LiveUsageTokens,
  provider: LlmApiProvider,
  modelId: string,
): number {
  return estimatePricedTokenUsageCostUsd(
    {
      inputTokens: usage.inputTokens,
      inputTokenDetails: {
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheWriteInputTokens,
      },
      outputTokens: usage.outputTokens,
    },
    provider,
    modelId,
  );
}

function pricedTokens(tokens: number | undefined, usdPerMillion: number): number {
  return ((tokens ?? 0) * usdPerMillion) / 1_000_000;
}
