import { z } from "zod";

import { isRecord } from "../shared/is-record";
import {
  imageRectToScreenBounds,
  isImageRectInBounds,
  parseScreenshotGeometry,
  resolveScreenshotGeometry,
} from "../shared/screenshot-geometry";
import { windowAutomationEnabled } from "../shared/ui-automation";
import type { CapabilityHostRunContext } from "../types";
import { defineCapability } from "../types";
import type { ScreenshotOutput } from "./screenshot";

function parseNativeScreenshotOutput(value: unknown): ScreenshotOutput {
  const geometry = parseScreenshotGeometry("native", value);
  if (!geometry || !isRecord(value)) {
    throw {
      code: "capture_failed",
      message: "screenshot_region native output missing geometry",
    };
  }
  const mimeType = value.mimeType;
  const base64 = value.base64;
  if (typeof mimeType !== "string" || typeof base64 !== "string") {
    throw {
      code: "capture_failed",
      message: "screenshot_region native output missing image bytes",
    };
  }
  return {
    width: geometry.width,
    height: geometry.height,
    mimeType,
    base64,
    bounds: geometry.bounds,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
  };
}

export const screenshotZoomInputSchema = z.object({
  imageX: z
    .number()
    .int()
    .describe("Inclusive left edge in the source screenshot image (pixels). Not screen coords."),
  imageY: z
    .number()
    .int()
    .describe("Inclusive top edge in the source screenshot image (pixels). Not screen coords."),
  imageWidth: z
    .number()
    .int()
    .min(1)
    .describe("Width of the zoom rect in source image pixels (≥ 1)"),
  imageHeight: z
    .number()
    .int()
    .min(1)
    .describe("Height of the zoom rect in source image pixels (≥ 1)"),
  screenshotCallId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Tool call id of a prior screenshot or screenshot_zoom; default is the latest successful one",
    ),
});

export type ScreenshotZoomInput = z.infer<typeof screenshotZoomInputSchema>;

/**
 * Host path: resolve source geometry → remap image rect → native screenshot_region.
 * Input is already Zod-parsed by the runner.
 */
async function runScreenshotZoom(
  input: ScreenshotZoomInput,
  ctx: CapabilityHostRunContext,
): Promise<ScreenshotOutput> {
  const events = ctx.getEventLog?.() ?? [];
  const resolved = resolveScreenshotGeometry(events, input.screenshotCallId);
  if (!resolved.ok) {
    throw resolved.error;
  }
  const { geometry } = resolved;

  if (
    !isImageRectInBounds(
      input.imageX,
      input.imageY,
      input.imageWidth,
      input.imageHeight,
      geometry.width,
      geometry.height,
    )
  ) {
    throw {
      code: "invalid_input",
      message: `Image rect (${input.imageX},${input.imageY},${input.imageWidth}x${input.imageHeight}) outside screenshot ${geometry.width}x${geometry.height}`,
    };
  }

  const screen = imageRectToScreenBounds({
    imageX: input.imageX,
    imageY: input.imageY,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    bounds: geometry.bounds,
    scaleX: geometry.scaleX,
    scaleY: geometry.scaleY,
  });

  if (screen.width <= 0 || screen.height <= 0) {
    throw {
      code: "invalid_input",
      message: `Remapped screen region has non-positive size (${screen.width}x${screen.height})`,
    };
  }

  const nativeOut = await ctx.invokeNative(
    "screenshot_region",
    {
      x: screen.x,
      y: screen.y,
      width: screen.width,
      height: screen.height,
    },
    ctx.workspaceRoot,
  );

  return parseNativeScreenshotOutput(nativeOut);
}

export const screenshotZoomCapability = defineCapability({
  name: "screenshot_zoom",
  description: [
    "Zoom: capture a higher-detail PNG of an image-space rectangle from a prior screenshot (or screenshot_zoom).",
    "Pass imageX/imageY/imageWidth/imageHeight from the image you see — host remaps to screen and captures natively.",
    "Use at most once per fine-click when the target is small, dense, or illegible, or after a miss. Do not chain zoom→zoom; re-orient with screenshot if still unclear.",
    "Returns the same geometry shape as screenshot so mouse_click_image can target this crop next.",
  ].join(" "),
  risk: "medium",
  inputSchema: screenshotZoomInputSchema,
  enabledWhen: windowAutomationEnabled,
  providesScreenshotGeometry: true,
  usesImageModelOutput: true,
  run: runScreenshotZoom,
});
