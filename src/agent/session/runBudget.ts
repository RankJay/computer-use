import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import {
  estimatePricedTokenUsageCostUsd,
  type PricedTokenUsage,
} from "@/agent/session/liveModelPricing";
import type { RunBudget, RunBudgetLimit, RunBudgetProgress } from "@/agent/types";

type BudgetStep = {
  readonly usage?: PricedTokenUsage;
};

export function estimateStepCostUsd(
  step: BudgetStep,
  provider: LlmApiProvider,
  modelId: string,
): number {
  if (step.usage === undefined) {
    return 0;
  }
  return estimatePricedTokenUsageCostUsd(step.usage, provider, modelId);
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
