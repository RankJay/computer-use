import { z } from "zod";

import {
  imageRectToScreenBounds,
  isImageRectInBounds,
  parseScreenshotGeometry,
  resolveScreenshotGeometry,
} from "../shared/screenshot-geometry";
import { windowAutomationEnabled } from "../shared/ui-automation";
import type { CapabilityNativeInvoker, CapabilityRunnerDeps } from "../types";
import { defineCapability } from "../types";
import type { ScreenshotOutput } from "./screenshot";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    scale: geometry.scale,
  };
}

export const screenshotRegionInputSchema = z.object({
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
      "Tool call id of a prior screenshot or screenshot_region; default is the latest successful one",
    ),
});

export type ScreenshotRegionInput = z.infer<typeof screenshotRegionInputSchema>;

export const screenshotRegionCapability = defineCapability({
  name: "screenshot_region",
  description: [
    "Zoom: capture a higher-detail PNG of an image-space rectangle from a prior screenshot (or screenshot_region).",
    "Pass imageX/imageY/imageWidth/imageHeight from the image you see — host remaps to screen and captures natively.",
    "Use at most once per fine-click when the target is small, dense, or illegible, or after a miss. Do not chain region→region; re-orient with screenshot if still unclear.",
    "Returns the same geometry shape as screenshot so mouse_click_image can target this crop next.",
  ].join(" "),
  risk: "medium",
  inputSchema: screenshotRegionInputSchema,
  enabledWhen: windowAutomationEnabled,
});

/**
 * Host path: resolve source geometry → remap image rect → native screenshot_region.
 */
export async function runScreenshotRegion(
  rawInput: unknown,
  deps: Pick<CapabilityRunnerDeps, "getEventLog" | "workspaceRoot">,
  invokeNative: CapabilityNativeInvoker,
): Promise<ScreenshotOutput> {
  const input = screenshotRegionInputSchema.parse(rawInput);
  const events = deps.getEventLog?.() ?? [];
  const geometry = resolveScreenshotGeometry(events, input.screenshotCallId);
  if ("code" in geometry) {
    throw geometry;
  }

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
    scale: geometry.scale,
    sourceImageWidth: geometry.width,
    sourceImageHeight: geometry.height,
  });

  if (screen.width <= 0 || screen.height <= 0) {
    throw {
      code: "invalid_input",
      message: `Remapped screen region has non-positive size (${screen.width}x${screen.height})`,
    };
  }

  const nativeOut = await invokeNative(
    "screenshot_region",
    {
      x: screen.x,
      y: screen.y,
      width: screen.width,
      height: screen.height,
    },
    deps.workspaceRoot,
  );

  return parseNativeScreenshotOutput(nativeOut);
}
