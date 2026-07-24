import { describe, expect, test } from "bun:test";

import type { RunStatus } from "./events";
import { createStallBridge } from "./stall-bridge";

describe("createStallBridge", () => {
  test("cancels once after stallAfterMs without progress beats", () => {
    let now = 1_000;
    let status: RunStatus = "streaming";
    let cancels = 0;

    const bridge = createStallBridge({
      getStatus: () => status,
      cancel: async () => {
        cancels += 1;
        status = "cancelled";
      },
      stallAfterMs: 100,
      now: () => now,
      // No automatic interval — drive poll manually.
      setIntervalFn: (() => 0) as unknown as typeof setInterval,
      clearIntervalFn: () => {},
    });

    bridge.onProjection();
    now = 1_050;
    expect(bridge.poll().stalled).toBe(false);
    expect(cancels).toBe(0);

    now = 1_101;
    expect(bridge.poll().stalled).toBe(true);
    expect(cancels).toBe(1);

    expect(bridge.poll().stalled).toBe(true);
    expect(cancels).toBe(1);
  });

  test("beat from onProjection while streaming resets the stall window", () => {
    let now = 1_000;
    const status: RunStatus = "streaming";
    let cancels = 0;

    const bridge = createStallBridge({
      getStatus: () => status,
      cancel: async () => {
        cancels += 1;
      },
      stallAfterMs: 100,
      now: () => now,
      setIntervalFn: (() => 0) as unknown as typeof setInterval,
      clearIntervalFn: () => {},
    });

    bridge.onProjection();
    now = 1_090;
    bridge.onProjection();
    now = 1_180;
    expect(bridge.poll().stalled).toBe(false);
    expect(cancels).toBe(0);
  });

  test("waiting_interaction stops polling — no cancel without progress poll", () => {
    let now = 1_000;
    let status: RunStatus = "streaming";
    let cancels = 0;
    let intervalCb: (() => void) | null = null;

    const bridge = createStallBridge({
      getStatus: () => status,
      cancel: async () => {
        cancels += 1;
      },
      stallAfterMs: 100,
      now: () => now,
      setIntervalFn: ((cb: () => void) => {
        intervalCb = cb;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
      clearIntervalFn: () => {
        intervalCb = null;
      },
    });

    bridge.onProjection();
    expect(intervalCb).not.toBeNull();

    status = "waiting_interaction";
    bridge.onProjection();
    expect(intervalCb).toBeNull();

    now = 2_000;
    // Manual poll still sees stall math, but production interval is stopped.
    // Host must not call poll during waiting_interaction — interval cleared.
    expect(cancels).toBe(0);
  });

  test("settled status resets watchdog", () => {
    let now = 1_000;
    let status: RunStatus = "streaming";

    const bridge = createStallBridge({
      getStatus: () => status,
      cancel: async () => {},
      stallAfterMs: 100,
      now: () => now,
      setIntervalFn: (() => 0) as unknown as typeof setInterval,
      clearIntervalFn: () => {},
    });

    bridge.onProjection();
    now = 1_200;
    status = "completed";
    bridge.onProjection();

    status = "streaming";
    bridge.onProjection();
    now = 1_250;
    expect(bridge.poll().stalled).toBe(false);
  });
});
