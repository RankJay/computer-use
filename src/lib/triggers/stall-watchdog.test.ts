import { describe, expect, test } from "bun:test";

import { createStallWatchdog } from "./stall-watchdog";

describe("createStallWatchdog", () => {
  test("stalled after stallAfterMs without beat (fake clock)", () => {
    let now = 1_000;
    let stalledCalls = 0;
    const watchdog = createStallWatchdog({
      stallAfterMs: 100,
      now: () => now,
      onStalled: () => {
        stalledCalls += 1;
      },
    });

    expect(watchdog.poll().stalled).toBe(false);
    now = 1_050;
    expect(watchdog.poll().stalled).toBe(false);
    now = 1_101;
    expect(watchdog.poll().stalled).toBe(true);
    expect(stalledCalls).toBe(1);
    expect(watchdog.poll().stalled).toBe(true);
    expect(stalledCalls).toBe(1);

    watchdog.beat();
    now = 1_150;
    expect(watchdog.poll().stalled).toBe(false);
  });
});
