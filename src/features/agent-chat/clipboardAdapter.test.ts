import { describe, expect, test } from "bun:test";
import {
  COPIED_FEEDBACK_DURATION_MS,
  createClipboardAdapter,
  type TextAreaClipboardFallback,
  type TimeoutScheduler,
} from "@/features/agent-chat/clipboardAdapter";

describe("clipboardAdapter", () => {
  test("writes through the clipboard API when available", async () => {
    const writes: string[] = [];
    const adapter = createClipboardAdapter({
      clipboard: {
        async writeText(text) {
          writes.push(text);
        },
      },
      scheduler: inertScheduler(),
    });

    await expect(adapter.writeClipboardText("Copied text")).resolves.toBe(true);
    expect(writes).toEqual(["Copied text"]);
  });

  test("falls back to a hidden textarea when clipboard access fails", async () => {
    const created: string[] = [];
    const selected: string[] = [];
    const removed: string[] = [];

    const adapter = createClipboardAdapter({
      clipboard: {
        async writeText() {
          throw new Error("clipboard blocked");
        },
      },
      clipboardFallback: clipboardFallbackFixture({
        created,
        selected,
        removed,
        copyResult: true,
      }),
      scheduler: inertScheduler(),
    });

    await expect(adapter.writeClipboardText("Fallback text")).resolves.toBe(true);
    expect(created).toEqual(["Fallback text"]);
    expect(selected).toEqual(["Fallback text"]);
    expect(removed).toEqual(["Fallback text"]);
  });

  test("returns false when no copy path succeeds", async () => {
    const removed: string[] = [];
    const adapter = createClipboardAdapter({
      clipboardFallback: clipboardFallbackFixture({
        created: [],
        selected: [],
        removed,
        copyResult: false,
      }),
      scheduler: inertScheduler(),
    });

    await expect(adapter.writeClipboardText("No copy")).resolves.toBe(false);
    expect(removed).toEqual(["No copy"]);
  });

  test("schedules reset work with the configured delay and supports cancellation", () => {
    let scheduledCallback: (() => void) | null = null;
    let scheduledDelay = 0;
    let clearedTimeoutId = 0;
    let didReset = false;

    const scheduler: TimeoutScheduler = {
      setTimeout(callback, delayMs) {
        scheduledCallback = callback;
        scheduledDelay = delayMs;
        return 42;
      },
      clearTimeout(timeoutId) {
        clearedTimeoutId = timeoutId;
      },
    };

    const adapter = createClipboardAdapter({ scheduler });
    const cancel = adapter.schedule(() => {
      didReset = true;
    }, COPIED_FEEDBACK_DURATION_MS);

    expect(scheduledDelay).toBe(COPIED_FEEDBACK_DURATION_MS);
    if (!scheduledCallback) throw new Error("expected scheduled callback");

    scheduledCallback();
    expect(didReset).toBe(true);

    cancel();
    expect(clearedTimeoutId).toBe(42);
  });
});

function inertScheduler(): TimeoutScheduler {
  return {
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
  };
}

function clipboardFallbackFixture(options: {
  readonly created: string[];
  readonly selected: string[];
  readonly removed: string[];
  readonly copyResult: boolean;
}): TextAreaClipboardFallback {
  return {
    createHiddenTextArea(text) {
      options.created.push(text);

      return {
        select() {
          options.selected.push(text);
        },
        remove() {
          options.removed.push(text);
        },
      };
    },
    copySelection() {
      return options.copyResult;
    },
  };
}
