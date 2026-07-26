import type { RuntimeEvent } from "@/lib/session/events";

import type { CapabilityError } from "../types";

export type ScreenshotBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Geometry needed to map screenshot image pixels → screen coords. */
export type ScreenshotGeometry = {
  callId: string;
  width: number;
  height: number;
  bounds: ScreenshotBounds;
  scale: number;
};

export type ImageToScreenInput = {
  imageX: number;
  imageY: number;
  bounds: ScreenshotBounds;
  scale: number;
  imageWidth: number;
  imageHeight: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Parse screenshot tool output into geometry, or null if unusable. */
export function parseScreenshotGeometry(
  callId: string,
  output: unknown,
): ScreenshotGeometry | null {
  if (!isRecord(output)) {
    return null;
  }
  const width = readFiniteNumber(output, "width");
  const height = readFiniteNumber(output, "height");
  const scale = readFiniteNumber(output, "scale");
  if (width === null || height === null || scale === null || width <= 0 || height <= 0) {
    return null;
  }
  if (!isRecord(output.bounds)) {
    return null;
  }
  const x = readFiniteNumber(output.bounds, "x");
  const y = readFiniteNumber(output.bounds, "y");
  const bw = readFiniteNumber(output.bounds, "width");
  const bh = readFiniteNumber(output.bounds, "height");
  if (x === null || y === null || bw === null || bh === null || bw <= 0 || bh <= 0) {
    return null;
  }
  return {
    callId,
    width,
    height,
    scale,
    bounds: { x, y, width: bw, height: bh },
  };
}

const SCREENSHOT_GEOMETRY_CAPABILITIES = new Set(["screenshot", "screenshot_region"]);

function isScreenshotGeometryCapability(name: string): boolean {
  return SCREENSHOT_GEOMETRY_CAPABILITIES.has(name);
}

/**
 * Resolve screenshot geometry from the attempt event log.
 * Default: latest successful `screenshot` or `screenshot_region`.
 * Optional: specific `screenshotCallId`.
 */
export function resolveScreenshotGeometry(
  events: readonly RuntimeEvent[],
  screenshotCallId?: string,
): ScreenshotGeometry | CapabilityError {
  if (screenshotCallId !== undefined) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!event) continue;
      if (event.type !== "capability.completed") continue;
      if (!isScreenshotGeometryCapability(event.capability)) continue;
      if (event.callId !== screenshotCallId) continue;
      const geometry = parseScreenshotGeometry(event.callId, event.output);
      if (!geometry) {
        return {
          code: "invalid_input",
          message: `Screenshot ${screenshotCallId} has no usable bounds/scale geometry`,
        };
      }
      return geometry;
    }
    return {
      code: "invalid_input",
      message: `No successful screenshot with callId ${screenshotCallId}`,
    };
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (event.type !== "capability.completed") continue;
    if (!isScreenshotGeometryCapability(event.capability)) continue;
    const geometry = parseScreenshotGeometry(event.callId, event.output);
    if (geometry) {
      return geometry;
    }
  }

  return {
    code: "invalid_input",
    message:
      "No successful screenshot in this attempt — call screenshot or screenshot_region first",
  };
}

/** True when image coords lie inside the image pixel grid. */
export function isImageCoordInBounds(
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return (
    Number.isInteger(imageX) &&
    Number.isInteger(imageY) &&
    imageX >= 0 &&
    imageY >= 0 &&
    imageX < imageWidth &&
    imageY < imageHeight
  );
}

/** True when an inclusive image rect lies fully inside the image. */
export function isImageRectInBounds(
  imageX: number,
  imageY: number,
  rectWidth: number,
  rectHeight: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return (
    Number.isInteger(imageX) &&
    Number.isInteger(imageY) &&
    Number.isInteger(rectWidth) &&
    Number.isInteger(rectHeight) &&
    imageX >= 0 &&
    imageY >= 0 &&
    rectWidth >= 1 &&
    rectHeight >= 1 &&
    imageX + rectWidth <= imageWidth &&
    imageY + rectHeight <= imageHeight
  );
}

/** Map image pixel → screen coords (ints). Does not bounds-check. */
export function imageToScreen(input: ImageToScreenInput): { screenX: number; screenY: number } {
  const scaleY = input.bounds.height / input.imageHeight;
  const screenX = Math.round(input.bounds.x + input.imageX * input.scale);
  const screenY = Math.round(input.bounds.y + input.imageY * scaleY);
  return { screenX, screenY };
}

/** Map inclusive image rect → screen bbox (ints). Does not bounds-check. */
export function imageRectToScreenBounds(input: {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  bounds: ScreenshotBounds;
  scale: number;
  sourceImageWidth: number;
  sourceImageHeight: number;
}): ScreenshotBounds {
  const tl = imageToScreen({
    imageX: input.imageX,
    imageY: input.imageY,
    bounds: input.bounds,
    scale: input.scale,
    imageWidth: input.sourceImageWidth,
    imageHeight: input.sourceImageHeight,
  });
  const br = imageToScreen({
    imageX: input.imageX + input.imageWidth - 1,
    imageY: input.imageY + input.imageHeight - 1,
    bounds: input.bounds,
    scale: input.scale,
    imageWidth: input.sourceImageWidth,
    imageHeight: input.sourceImageHeight,
  });
  const x = Math.min(tl.screenX, br.screenX);
  const y = Math.min(tl.screenY, br.screenY);
  const width = Math.abs(br.screenX - tl.screenX) + 1;
  const height = Math.abs(br.screenY - tl.screenY) + 1;
  return { x, y, width, height };
}
