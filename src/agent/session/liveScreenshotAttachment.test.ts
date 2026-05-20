import { describe, expect, test } from "bun:test";

import {
  buildScreenshotAttachmentStep,
  shouldAttachLatestScreenshot,
} from "@/agent/session/liveScreenshotAttachment";

describe("liveScreenshotAttachment", () => {
  test("shouldAttachLatestScreenshot requires png and stepNumber >= 2", () => {
    expect(shouldAttachLatestScreenshot(null, 2)).toBe(false);
    expect(shouldAttachLatestScreenshot("abc", 1)).toBe(false);
    expect(shouldAttachLatestScreenshot("abc", 2)).toBe(true);
  });

  test("buildScreenshotAttachmentStep embeds base64 data url", () => {
    const step = buildScreenshotAttachmentStep("base64png");
    const imagePart = step.messages[0]?.content[1];
    expect(imagePart?.type).toBe("image");
    if (imagePart?.type === "image") {
      expect(imagePart.image).toBe("data:image/png;base64,base64png");
    }
  });
});
