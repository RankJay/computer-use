import { ANTHROPIC_MODEL_OPTIONS, OPENAI_MODEL_OPTIONS } from "@/agent/llm/modelCatalog";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import type { TokenUsage } from "@/agent/types";

export type ModelTokenPrice = {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly cacheReadUsdPerMillion?: number;
  readonly cacheWriteUsdPerMillion?: number;
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

export function estimateCostUsd(
  usage: TokenUsage,
  provider: LlmApiProvider,
  modelId: string,
): number {
  const price = liveModelPriceFor(provider, modelId);
  if (price === null) {
    return 0;
  }

  const cachedInputTokens = usage.cacheReadInputTokens + usage.cacheWriteInputTokens;
  const inputTokens = Math.max(usage.inputTokens - cachedInputTokens, 0);

  return (
    pricedTokens(inputTokens, price.inputUsdPerMillion) +
    pricedTokens(usage.outputTokens, price.outputUsdPerMillion) +
    pricedTokens(
      usage.cacheReadInputTokens,
      price.cacheReadUsdPerMillion ?? price.inputUsdPerMillion,
    ) +
    pricedTokens(
      usage.cacheWriteInputTokens,
      price.cacheWriteUsdPerMillion ?? price.inputUsdPerMillion,
    )
  );
}

function pricedTokens(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / 1_000_000;
}
