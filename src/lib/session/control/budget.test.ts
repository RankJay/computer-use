import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createBudgetGuard, createBudgetTracker, formatBudgetExceededMessage } from "./budget";

describe("budget", () => {
  test("detects step limit when over max", () => {
    const tracker = createBudgetTracker({ ...DEFAULT_SETTINGS, maxSteps: 2 });
    tracker.incrementStep();
    tracker.incrementStep();
    tracker.incrementStep();

    const result = tracker.checkBudget();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.dimension).toBe("steps");
    }
  });

  test("allows run at exactly max steps", () => {
    const tracker = createBudgetTracker({ ...DEFAULT_SETTINGS, maxSteps: 2 });
    tracker.incrementStep();
    tracker.incrementStep();

    expect(tracker.checkBudget().ok).toBe(true);
  });

  test("detects cost limit", () => {
    const tracker = createBudgetTracker({ ...DEFAULT_SETTINGS, maxCostUsd: 0.01 });
    tracker.addCostUsd(0.02);

    const result = tracker.checkBudget();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.dimension).toBe("cost");
    }
  });

  test("zero cost cap means unlimited", () => {
    const tracker = createBudgetTracker({ ...DEFAULT_SETTINGS, maxCostUsd: 0 });
    tracker.addCostUsd(100);

    expect(tracker.checkBudget().ok).toBe(true);
  });

  test("zero wall-clock cap means unlimited", () => {
    const tracker = createBudgetTracker(
      { ...DEFAULT_SETTINGS, maxWallClockMs: 0 },
      Date.now() - 60_000,
    );

    expect(tracker.checkBudget().ok).toBe(true);
  });

  test("formatBudgetExceededMessage uses readable copy", () => {
    expect(formatBudgetExceededMessage("wall_clock")).toBe("Run stopped: time limit reached");
    expect(formatBudgetExceededMessage("steps")).toBe("Run stopped: step limit reached");
    expect(formatBudgetExceededMessage("cost")).toBe("Run stopped: cost limit reached");
  });

  test("createBudgetGuard emits once and latches", () => {
    const tracker = createBudgetTracker(
      { ...DEFAULT_SETTINGS, maxWallClockMs: 1 },
      Date.now() - 10,
    );
    const emissions: string[] = [];

    const guard = createBudgetGuard(tracker, (dimension) => {
      emissions.push(dimension);
    });

    expect(guard.checkAndStop()).toBe(true);
    expect(guard.checkAndStop()).toBe(true);
    expect(emissions).toEqual(["wall_clock"]);
  });
});
