import { describe, expect, test } from "bun:test";

import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { takeActiveRun, type ActiveRun } from "@/features/control-center/useAgentSession";

function createNativeBridgeSpy(): {
  readonly native: AgentNativeBridge;
  readonly cancelPointerAutomationCalls: () => number;
} {
  let cancelPointerAutomationCalls = 0;

  return {
    native: {
      capturePrimaryDisplayPngBase64: async () => ({
        pngBase64: "",
        imageWidth: 1,
        imageHeight: 1,
        displayX: 0,
        displayY: 0,
        displayWidth: 1,
        displayHeight: 1,
        scaleFactor: 1,
        effectiveScaleFactor: 1,
        gridCellPx: 16,
        blockColumns: 1,
        blockRows: 1,
        cursorBlockX: null,
        cursorBlockY: null,
      }),
      runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
      cancelRunCommand: async () => {},
      pointerMoveTo: async () => ({ cursorBlockX: null, cursorBlockY: null }),
      pointerClick: async () => {},
      typeText: async () => {},
      keyTap: async () => {},
      resetPointerAutomationCancel: async () => {},
      cancelPointerAutomation: async () => {
        cancelPointerAutomationCalls += 1;
      },
    },
    cancelPointerAutomationCalls: () => cancelPointerAutomationCalls,
  };
}

describe("takeActiveRun", () => {
  test("clears the active run handle before reset cancellation work continues", async () => {
    const controller = new AbortController();
    const nativeSpy = createNativeBridgeSpy();
    const activeRun: ActiveRun = {
      taskId: "task-1",
      controller,
      native: nativeSpy.native,
    };
    const activeRunRef = { current: activeRun };

    const resetRun = takeActiveRun(activeRunRef);
    resetRun?.controller.abort();
    await resetRun?.native?.cancelPointerAutomation();

    expect(activeRunRef.current).toBeNull();
    expect(controller.signal.aborted).toBe(true);
    expect(nativeSpy.cancelPointerAutomationCalls()).toBe(1);
  });
});
