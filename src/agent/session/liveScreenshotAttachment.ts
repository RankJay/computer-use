import type { ModelMessage } from "ai";

import type { DisplayCaptureResult } from "@/agent/native/nativeBridge";
import { BLOCK_PX } from "@/agent/tools/uiAutomationState";

export type ScreenshotAttachmentStep = {
  readonly messages: ModelMessage[];
};

export function shouldAttachLatestScreenshot(
  latestCapture: DisplayCaptureResult | null,
  stepNumber: number,
): latestCapture is DisplayCaptureResult {
  return latestCapture !== null && stepNumber >= 1;
}

export function buildScreenshotAttachmentStep(
  capture: DisplayCaptureResult,
  objective: string,
): ScreenshotAttachmentStep {
  const cursorLine =
    capture.cursorBlockX !== null && capture.cursorBlockY !== null
      ? `Cursor block: (${capture.cursorBlockX}, ${capture.cursorBlockY})`
      : "Cursor block: unknown";
  const objectiveLine = objective.trim();

  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Screenshot with pink block grid (${BLOCK_PX}×${BLOCK_PX}px blocks).
Original user task remains binding:
${objectiveLine}

Grid: ${capture.blockColumns} blocks wide × ${capture.blockRows} blocks tall.
Use blockX and blockY only (1-based; top-left is 1,1). Yellow numbers on top label blockX; on the left label blockY. Ignore fine blue lines when picking.
Pick the block that advances the original user task — NOT the cursor block below.
Next: pointer_move(blockX, blockY) then pointer_click — do NOT call display_capture again unless the screen changed.
${cursorLine} (informational only — do not move here unless that is your target)`,
          },
          {
            type: "image",
            image: `data:image/png;base64,${capture.pngBase64}`,
          },
        ],
      },
    ],
  };
}
