import { describe, expect, test } from "bun:test";

import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createBudgetTracker } from "./budget";

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
});
