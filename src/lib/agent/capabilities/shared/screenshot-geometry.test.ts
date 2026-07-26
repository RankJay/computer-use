import { describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/lib/session/events";
import { RUNTIME_EVENT_SCHEMA_VERSION } from "@/lib/session/events";

import {
  imageRectToScreenBounds,
  imageToScreen,
  isImageCoordInBounds,
  isImageRectInBounds,
  parseScreenshotGeometry,
  resolveScreenshotGeometry,
} from "./screenshot-geometry";

function completedScreenshot(
  callId: string,
  output: unknown,
  timestamp = 1,
  capability: "screenshot" | "screenshot_region" = "screenshot",
): RuntimeEvent {
  return {
    eventId: `evt-${callId}`,
    attemptId: "a1",
    timestamp,
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    type: "capability.completed",
    callId,
    capability,
    output,
  };
}

const sampleOutput = {
  width: 100,
  height: 50,
  mimeType: "image/png",
  base64: "x",
  bounds: { x: 10, y: 20, width: 200, height: 100 },
  scale: 2,
};

describe("screenshot-geometry", () => {
  test("imageToScreen maps with scale and bounds", () => {
    expect(
      imageToScreen({
        imageX: 5,
        imageY: 10,
        bounds: { x: 10, y: 20, width: 200, height: 100 },
        scale: 2,
        imageWidth: 100,
        imageHeight: 50,
      }),
    ).toEqual({ screenX: 20, screenY: 40 });
  });

  test("isImageCoordInBounds rejects edges at width/height", () => {
    expect(isImageCoordInBounds(0, 0, 100, 50)).toBe(true);
    expect(isImageCoordInBounds(99, 49, 100, 50)).toBe(true);
    expect(isImageCoordInBounds(100, 0, 100, 50)).toBe(false);
    expect(isImageCoordInBounds(0, 50, 100, 50)).toBe(false);
    expect(isImageCoordInBounds(-1, 0, 100, 50)).toBe(false);
  });

  test("parseScreenshotGeometry reads camelCase tool output", () => {
    const geo = parseScreenshotGeometry("c1", sampleOutput);
    expect(geo).toEqual({
      callId: "c1",
      width: 100,
      height: 50,
      scale: 2,
      bounds: { x: 10, y: 20, width: 200, height: 100 },
    });
  });

  test("resolveScreenshotGeometry uses latest screenshot by default", () => {
    const events = [
      completedScreenshot("old", sampleOutput, 1),
      completedScreenshot(
        "new",
        { ...sampleOutput, bounds: { x: 0, y: 0, width: 200, height: 100 } },
        2,
      ),
    ];
    const geo = resolveScreenshotGeometry(events);
    expect("callId" in geo && geo.callId).toBe("new");
  });

  test("resolveScreenshotGeometry honors screenshotCallId", () => {
    const events = [
      completedScreenshot("old", sampleOutput, 1),
      completedScreenshot("new", sampleOutput, 2),
    ];
    const geo = resolveScreenshotGeometry(events, "old");
    expect("callId" in geo && geo.callId).toBe("old");
  });

  test("resolveScreenshotGeometry errors when missing", () => {
    const err = resolveScreenshotGeometry([]);
    expect("code" in err && err.code).toBe("invalid_input");
  });

  test("resolveScreenshotGeometry errors on unknown callId", () => {
    const err = resolveScreenshotGeometry([completedScreenshot("c1", sampleOutput)], "missing");
    expect("code" in err && err.message).toContain("missing");
  });

  test("resolveScreenshotGeometry accepts screenshot_region as latest", () => {
    const events = [
      completedScreenshot("full", sampleOutput, 1, "screenshot"),
      completedScreenshot(
        "crop",
        {
          ...sampleOutput,
          width: 40,
          height: 20,
          bounds: { x: 30, y: 40, width: 80, height: 40 },
          scale: 2,
        },
        2,
        "screenshot_region",
      ),
    ];
    const geo = resolveScreenshotGeometry(events);
    expect("callId" in geo && geo.callId).toBe("crop");
  });

  test("isImageRectInBounds and imageRectToScreenBounds", () => {
    expect(isImageRectInBounds(10, 10, 20, 10, 100, 50)).toBe(true);
    expect(isImageRectInBounds(90, 10, 20, 10, 100, 50)).toBe(false);
    expect(
      imageRectToScreenBounds({
        imageX: 5,
        imageY: 10,
        imageWidth: 10,
        imageHeight: 5,
        bounds: { x: 10, y: 20, width: 200, height: 100 },
        scale: 2,
        sourceImageWidth: 100,
        sourceImageHeight: 50,
      }),
    ).toEqual({ x: 20, y: 40, width: 19, height: 9 });
  });
});
