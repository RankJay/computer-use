import { describe, expect, test } from "bun:test";

import {
  buildScreenshotAttachmentStep,
  shouldAttachLatestScreenshot,
} from "@/agent/session/liveScreenshotAttachment";
import type { DisplayCaptureResult } from "@/agent/native/nativeBridge";

const capture: DisplayCaptureResult = {
  pngBase64: "base64png",
  imageWidth: 2560,
  imageHeight: 1440,
  displayX: 0,
  displayY: 0,
  displayWidth: 2048,
  displayHeight: 1152,
  scaleFactor: 1.25,
  cursorImageX: 100,
  cursorImageY: 200,
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
      expect(textPart.text).toContain("choose the next action");
      expect(textPart.text).toContain("Image size: 2560x1440 pixels");
      expect(textPart.text).toContain("Display capture size: 2048x1152 physical pixels");
      expect(textPart.text).toContain("Cursor position in image: (100, 200)");
    }
    expect(imagePart?.type).toBe("image");
    if (imagePart?.type === "image") {
      expect(imagePart.image).toBe("data:image/png;base64,base64png");
    }
  });
});
