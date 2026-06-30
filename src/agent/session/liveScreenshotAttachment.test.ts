import { describe, expect, test } from "bun:test";

import {
  buildScreenshotAttachmentStep,
  shouldAttachLatestScreenshot,
} from "@/agent/session/liveScreenshotAttachment";
import type { DisplayCaptureResult } from "@/agent/native/nativeBridge";

const capture: DisplayCaptureResult = {
  pngBase64: "base64png",
  imageWidth: 800,
  imageHeight: 960,
  displayX: 0,
  displayY: 0,
  displayWidth: 640,
  displayHeight: 768,
  scaleFactor: 1.25,
  effectiveScaleFactor: 1.5,
  gridCellPx: 16,
  blockColumns: 5,
  blockRows: 6,
  cursorBlockX: 3,
  cursorBlockY: 4,
};

describe("liveScreenshotAttachment", () => {
  test("shouldAttachLatestScreenshot attaches captured pixels on the next model step", () => {
    expect(shouldAttachLatestScreenshot(null, 1)).toBe(false);
    expect(shouldAttachLatestScreenshot(capture, 0)).toBe(false);
    expect(shouldAttachLatestScreenshot(capture, 1)).toBe(true);
  });

  test("buildScreenshotAttachmentStep embeds base64 data url", () => {
    const step = buildScreenshotAttachmentStep(capture);
    const textPart = step.messages[0]?.content[0];
    const imagePart = step.messages[0]?.content[1];
    expect(textPart?.type).toBe("text");
    if (textPart?.type === "text") {
      expect(textPart.text).toContain("5 blocks wide × 6 blocks tall");
      expect(textPart.text).toContain("NOT the cursor block");
      expect(textPart.text).toContain("informational only");
      expect(textPart.text).toContain("Cursor block: (3, 4)");
    }
    expect(imagePart?.type).toBe("image");
    if (imagePart?.type === "image") {
      expect(imagePart.image).toBe("data:image/png;base64,base64png");
    }
  });
});
