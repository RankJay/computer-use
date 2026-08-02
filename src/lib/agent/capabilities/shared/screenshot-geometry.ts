import type { RuntimeEvent } from "@/lib/session/events";

import type { CapabilityError } from "../types";
import { isRecord } from "./is-record";
import { isScreenshotGeometrySource } from "./screenshot-geometry-sources";

/** Canonical screen-space rect for screenshot geometry. */
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
  /** Screen units per image pixel (x). */
  scaleX: number;
  /** Screen units per image pixel (y). */
  scaleY: number;
};

export type ImageToScreenInput = {
  imageX: number;
  imageY: number;
  bounds: ScreenshotBounds;
  scaleX: number;
  scaleY: number;
};

export type ResolveScreenshotGeometryResult =
  | { ok: true; geometry: ScreenshotGeometry }
  | { ok: false; error: CapabilityError };

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Parse screenshot tool output into geometry, or null if unusable. Requires scaleX/scaleY. */
export function parseScreenshotGeometry(
  callId: string,
  output: unknown,
): ScreenshotGeometry | null {
  if (!isRecord(output)) {
    return null;
  }
  const width = readFiniteNumber(output, "width");
  const height = readFiniteNumber(output, "height");
  if (width === null || height === null || width <= 0 || height <= 0) {
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

  const scaleX = readFiniteNumber(output, "scaleX");
  const scaleY = readFiniteNumber(output, "scaleY");
  if (scaleX === null || scaleY === null || scaleX <= 0 || scaleY <= 0) {
    return null;
  }

  return {
    callId,
    width,
    height,
    scaleX,
    scaleY,
    bounds: { x, y, width: bw, height: bh },
  };
}

/**
 * Resolve screenshot geometry from the attempt event log.
 * Default: latest successful screenshot / screenshot_zoom (registered via providesScreenshotGeometry).
 * Optional: specific `screenshotCallId`.
 */
export function resolveScreenshotGeometry(
  events: readonly RuntimeEvent[],
  screenshotCallId?: string,
): ResolveScreenshotGeometryResult {
  if (screenshotCallId !== undefined) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!event) continue;
      if (event.type !== "capability.completed") continue;
      if (!isScreenshotGeometrySource(event.capability)) continue;
      if (event.callId !== screenshotCallId) continue;
      const geometry = parseScreenshotGeometry(event.callId, event.output);
      if (!geometry) {
        return {
          ok: false,
          error: {
            code: "invalid_input",
            message: `Screenshot ${screenshotCallId} has no usable bounds/scale geometry`,
          },
        };
      }
      return { ok: true, geometry };
    }
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `No successful screenshot with callId ${screenshotCallId}`,
      },
    };
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (event.type !== "capability.completed") continue;
    if (!isScreenshotGeometrySource(event.capability)) continue;
    const geometry = parseScreenshotGeometry(event.callId, event.output);
    if (geometry) {
      return { ok: true, geometry };
    }
  }

  return {
    ok: false,
    error: {
      code: "invalid_input",
      message:
        "No successful screenshot in this attempt — call screenshot or screenshot_zoom first",
    },
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
  const screenX = Math.round(input.bounds.x + input.imageX * input.scaleX);
  const screenY = Math.round(input.bounds.y + input.imageY * input.scaleY);
  return { screenX, screenY };
}

/** Map inclusive image rect → screen bbox (ints). Does not bounds-check. */
export function imageRectToScreenBounds(input: {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  bounds: ScreenshotBounds;
  scaleX: number;
  scaleY: number;
}): ScreenshotBounds {
  const tl = imageToScreen({
    imageX: input.imageX,
    imageY: input.imageY,
    bounds: input.bounds,
    scaleX: input.scaleX,
    scaleY: input.scaleY,
  });
  const br = imageToScreen({
    imageX: input.imageX + input.imageWidth - 1,
    imageY: input.imageY + input.imageHeight - 1,
    bounds: input.bounds,
    scaleX: input.scaleX,
    scaleY: input.scaleY,
  });
  const x = Math.min(tl.screenX, br.screenX);
  const y = Math.min(tl.screenY, br.screenY);
  const width = Math.abs(br.screenX - tl.screenX) + 1;
  const height = Math.abs(br.screenY - tl.screenY) + 1;
  return { x, y, width, height };
}
