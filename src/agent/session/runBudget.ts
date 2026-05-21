import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { estimateCostUsd } from "@/agent/session/liveModelPricing";
import type {
  PartialTokenUsage,
  RunBudget,
  RunBudgetLimit,
  RunBudgetProgress,
  TokenUsage,
} from "@/agent/types";

type BudgetStep = {
  readonly usage?: PartialTokenUsage & {
    readonly inputTokenDetails?: {
      readonly cacheReadTokens?: number;
      readonly cacheWriteTokens?: number;
    };
  };
};

export function estimateStepCostUsd(
  step: BudgetStep,
  provider: LlmApiProvider,
  modelId: string,
): number {
  if (step.usage === undefined) {
    return 0;
  }
  return estimateCostUsd(tokenUsageFromBudgetStepUsage(step.usage), provider, modelId);
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

function tokenUsageFromBudgetStepUsage(stepUsage: NonNullable<BudgetStep["usage"]>): TokenUsage {
  return {
    inputTokens: stepUsage.inputTokens ?? 0,
    outputTokens: stepUsage.outputTokens ?? 0,
    cacheReadInputTokens:
      stepUsage.cacheReadInputTokens ?? stepUsage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteInputTokens:
      stepUsage.cacheWriteInputTokens ?? stepUsage.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
}
