import { z } from "zod";

import {
  imageToScreen,
  isImageCoordInBounds,
  resolveScreenshotGeometry,
} from "../shared/screenshot-geometry";
import { uiAutomationEnabled } from "../shared/ui-automation";
import type { CapabilityNativeInvoker, CapabilityRunnerDeps } from "../types";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseClickImageInputSchema = z.object({
  imageX: z
    .number()
    .int()
    .describe(
      "Single integer: image-pixel X (left→right). Example: 138. Not a pair, not comma-separated, not screen coords.",
    ),
  imageY: z
    .number()
    .int()
    .describe(
      "Single integer: image-pixel Y (top→bottom). Example: 360. Not a pair, not comma-separated, not screen coords.",
    ),
  button: mouseButtonSchema.optional().describe("Mouse button to click (default left)"),
  count: z.number().int().min(1).optional().describe("Number of clicks (default 1)"),
  screenshotCallId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Tool call id of a prior screenshot or screenshot_region; default is the latest successful one in this attempt",
    ),
});

export type MouseClickImageInput = z.infer<typeof mouseClickImageInputSchema>;

export type MouseClickImageOutput = {
  ok: boolean;
  screenX: number;
  screenY: number;
  screenshotCallId: string;
};

export const mouseClickImageCapability = defineCapability({
  name: "mouse_click_image",
  description: [
    "Click at a point in the latest screenshot image (host remaps image pixels to screen).",
    'Args are two separate integers, e.g. {"imageX":138,"imageY":360} — never put both coords in one field.',
    "Pass imageX/imageY from the screenshot you see — do not multiply by scale or add bounds.",
    "Optional screenshotCallId targets an earlier screenshot or screenshot_region; otherwise uses the latest successful one.",
    "Prefer accessibility_click when a ref exists. Prefer this over mouse_click(x,y) after a screenshot.",
  ].join(" "),
  risk: "high",
  inputSchema: mouseClickImageInputSchema,
  enabledWhen: uiAutomationEnabled,
});

/**
 * Host path: resolve screenshot geometry → remap → native mouse_click.
 * Throws CapabilityError-shaped objects on validation failure.
 */
export async function runMouseClickImage(
  rawInput: unknown,
  deps: Pick<CapabilityRunnerDeps, "getEventLog" | "workspaceRoot">,
  invokeNative: CapabilityNativeInvoker,
): Promise<MouseClickImageOutput> {
  const input = mouseClickImageInputSchema.parse(rawInput);
  const events = deps.getEventLog?.() ?? [];
  const geometry = resolveScreenshotGeometry(events, input.screenshotCallId);
  if ("code" in geometry) {
    throw geometry;
  }

  if (!isImageCoordInBounds(input.imageX, input.imageY, geometry.width, geometry.height)) {
    throw {
      code: "invalid_input",
      message: `Image coords (${input.imageX}, ${input.imageY}) outside screenshot ${geometry.width}x${geometry.height}`,
    };
  }

  const { screenX, screenY } = imageToScreen({
    imageX: input.imageX,
    imageY: input.imageY,
    bounds: geometry.bounds,
    scale: geometry.scale,
    imageWidth: geometry.width,
    imageHeight: geometry.height,
  });

  const button = input.button ?? "left";
  const count = input.count ?? 1;

  const nativeOut = await invokeNative(
    "mouse_click",
    { button, count, x: screenX, y: screenY },
    deps.workspaceRoot,
  );

  return {
    ok: nativeClickSucceeded(nativeOut),
    screenX,
    screenY,
    screenshotCallId: geometry.callId,
  };
}

function nativeClickSucceeded(nativeOut: unknown): boolean {
  return (
    typeof nativeOut === "object" &&
    nativeOut !== null &&
    "ok" in nativeOut &&
    nativeOut.ok === true
  );
}
