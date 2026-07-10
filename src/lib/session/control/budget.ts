import type { AppSettings } from "@/lib/settings/types";

import type { BudgetExceededPayload } from "../events";

export type BudgetDimension = BudgetExceededPayload["dimension"];

export type BudgetTracker = {
  incrementStep: () => void;
  addCostUsd: (amount: number) => void;
  checkBudget: () => { ok: true } | { ok: false; dimension: BudgetDimension };
  snapshot: () => {
    stepsUsed: number;
    maxSteps: number;
    costUsd: number;
    maxCostUsd: number;
    elapsedMs: number;
    maxWallClockMs: number;
  };
};

function isOverSteps(stepsUsed: number, maxSteps: number): boolean {
  return maxSteps > 0 && stepsUsed > maxSteps;
}

function isOverCost(costUsd: number, maxCostUsd: number): boolean {
  return maxCostUsd > 0 && costUsd >= maxCostUsd;
}

function isOverWallClock(startedAt: number, maxWallClockMs: number): boolean {
  return maxWallClockMs > 0 && Date.now() - startedAt >= maxWallClockMs;
}

export function formatBudgetExceededMessage(dimension: BudgetDimension): string {
  switch (dimension) {
    case "steps":
      return "Run stopped: step limit reached";
    case "cost":
      return "Run stopped: cost limit reached";
    case "wall_clock":
      return "Run stopped: time limit reached";
    default: {
      const _exhaustive: never = dimension;
      return _exhaustive;
    }
  }
}

export type BudgetGuard = {
  exceeded: () => BudgetDimension | null;
  checkAndStop: () => boolean;
};

export function createBudgetGuard(
  budget: BudgetTracker,
  onExceeded: (dimension: BudgetDimension) => void,
): BudgetGuard {
  let dimension: BudgetDimension | null = null;

  return {
    exceeded: () => dimension,
    checkAndStop: () => {
      if (dimension) {
        return true;
      }

      const check = budget.checkBudget();
      if (!check.ok) {
        dimension = check.dimension;
        onExceeded(check.dimension);
        return true;
      }

      return false;
    },
  };
}

export function createBudgetTracker(
  settings: AppSettings,
  startedAt: number = Date.now(),
): BudgetTracker {
  let stepsUsed = 0;
  let costUsd = 0;

  return {
    incrementStep() {
      stepsUsed += 1;
    },
    addCostUsd(amount: number) {
      if (Number.isFinite(amount) && amount > 0) {
        costUsd += amount;
      }
    },
    checkBudget() {
      if (isOverSteps(stepsUsed, settings.maxSteps)) {
        return { ok: false, dimension: "steps" as const };
      }
      if (isOverCost(costUsd, settings.maxCostUsd)) {
        return { ok: false, dimension: "cost" as const };
      }
      if (isOverWallClock(startedAt, settings.maxWallClockMs)) {
        return { ok: false, dimension: "wall_clock" as const };
      }
      return { ok: true };
    },
    snapshot() {
      return {
        stepsUsed,
        maxSteps: settings.maxSteps,
        costUsd,
        maxCostUsd: settings.maxCostUsd,
        elapsedMs: Date.now() - startedAt,
        maxWallClockMs: settings.maxWallClockMs,
      };
    },
  };
}
