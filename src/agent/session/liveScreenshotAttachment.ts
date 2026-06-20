import type { ModelMessage } from "ai";

import type { DisplayCaptureResult } from "@/agent/native/nativeBridge";

export type ScreenshotAttachmentStep = {
  readonly messages: ModelMessage[];
};

export function shouldAttachLatestScreenshot(
  latestCapture: DisplayCaptureResult | null,
  stepNumber: number,
): latestCapture is DisplayCaptureResult {
  return latestCapture !== null && stepNumber >= 1;
}

function formatCursorPosition(capture: DisplayCaptureResult): string {
  if (capture.cursorImageX === null || capture.cursorImageY === null) {
    return "Cursor position in image: unknown";
  }
  return `Cursor position in image: (${capture.cursorImageX}, ${capture.cursorImageY})`;
}

export function buildScreenshotAttachmentStep(
  capture: DisplayCaptureResult,
): ScreenshotAttachmentStep {
  return {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Attached: latest primary-display PNG. Use it to choose the next action, not to explain the image.

Image coordinate frame:
- Image size: ${capture.imageWidth}x${capture.imageHeight} pixels
- Pointer coordinates must be image pixels from top-left (0, 0)
- Display origin: (${capture.displayX}, ${capture.displayY})
- Display capture size: ${capture.displayWidth}x${capture.displayHeight} physical pixels
- Display scale factor: ${capture.scaleFactor}
- ${formatCursorPosition(capture)}

Use the center of the intended target. If a pointer move was inaccurate, compare the cursor position above to the target in this fresh image and correct from the latest image, not an older screenshot.`,
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
