import { describe, expect, test } from "bun:test";

import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import {
  isToolTimeoutError,
  toolTimeoutFromNativeError,
  withToolTimeout,
} from "@/agent/tools/toolCancellation";

describe("toolCancellation", () => {
  test("withToolTimeout rejects with a structured timeout and runs cleanup", async () => {
    let cleanedUp = false;

    try {
      await withToolTimeout(
        AGENT_TOOL_NAMES.FILE_READ,
        new Promise<string>(() => {}),
        async () => {
          cleanedUp = true;
        },
        1,
      );
      throw new Error("expected timeout");
    } catch (err) {
      if (!isToolTimeoutError(err)) {
        throw err;
      }
      expect(err.payload).toMatchObject({
        kind: "timeout",
        timeoutMs: 1,
      });
      expect(err.payload.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(cleanedUp).toBe(true);
    }
  });

  test("toolTimeoutFromNativeError preserves structured timeout handling for Rust errors", () => {
    const timeout = toolTimeoutFromNativeError(
      "command timed out after 120000 ms: powershell []",
      AGENT_TOOL_NAMES.TERMINAL_RUN,
    );

    expect(timeout?.payload).toEqual({
      kind: "timeout",
      timeoutMs: 120_000,
      elapsedMs: 120_000,
    });
  });
});
