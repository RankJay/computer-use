import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import type { RunBudget, RunBudgetLimit, RunBudgetProgress } from "@/agent/types";

type TokenUsage = {
  readonly inputTokens?: number;
  readonly inputTokenDetails?: {
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
  readonly outputTokens?: number;
};

type BudgetStep = {
  readonly usage?: TokenUsage;
};

type ModelTokenPrice = {
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

function priceForModel(provider: LlmApiProvider, modelId: string): ModelTokenPrice | null {
  const catalog = provider === "anthropic" ? ANTHROPIC_PRICES : OPENAI_PRICES;
  return catalog[modelId] ?? null;
}

function pricedTokens(tokens: number | undefined, usdPerMillion: number): number {
  return ((tokens ?? 0) * usdPerMillion) / 1_000_000;
}

export function estimateStepCostUsd(
  step: BudgetStep,
  provider: LlmApiProvider,
  modelId: string,
): number {
  const price = priceForModel(provider, modelId);
  if (price === null) {
    return 0;
  }

  const cacheReadTokens = step.usage?.inputTokenDetails?.cacheReadTokens;
  const cacheWriteTokens = step.usage?.inputTokenDetails?.cacheWriteTokens;
  const cachedInputTokens = (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
  const inputTokens = Math.max((step.usage?.inputTokens ?? 0) - cachedInputTokens, 0);

  return (
    pricedTokens(inputTokens, price.inputUsdPerMillion) +
    pricedTokens(step.usage?.outputTokens, price.outputUsdPerMillion) +
    pricedTokens(cacheReadTokens, price.cacheReadUsdPerMillion ?? price.inputUsdPerMillion) +
    pricedTokens(cacheWriteTokens, price.cacheWriteUsdPerMillion ?? price.inputUsdPerMillion)
  );
}

export function estimateRunCostUsd(
  steps: readonly BudgetStep[],
  provider: LlmApiProvider,
  modelId: string,
): number {
  return steps.reduce((total, step) => total + estimateStepCostUsd(step, provider, modelId), 0);
}

export function createRunBudgetProgress(options: {
  readonly budget: RunBudget;
  readonly steps: readonly BudgetStep[];
  readonly provider: LlmApiProvider;
  readonly modelId: string;
  readonly startedAt: number;
  readonly now: number;
}): RunBudgetProgress {
  return {
    steps: options.steps.length,
    costUsd: estimateRunCostUsd(options.steps, options.provider, options.modelId),
    wallClockMs: Math.max(0, options.now - options.startedAt),
    budget: options.budget,
  };
}

export function exceededBudgetLimit(progress: RunBudgetProgress): RunBudgetLimit | null {
  if (progress.steps >= progress.budget.maxSteps) {
    return "maxSteps";
  }
  if (progress.costUsd >= progress.budget.maxCostUsd) {
    return "maxCostUsd";
  }
  if (progress.wallClockMs >= progress.budget.maxWallClockMs) {
    return "maxWallClockMs";
  }
  return null;
}
