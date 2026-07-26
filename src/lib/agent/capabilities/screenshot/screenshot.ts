import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import type { ScreenshotBounds } from "../shared/screenshot-geometry";
import { windowAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export type { ScreenshotBounds };

/** Plain object (not discriminatedUnion) so Anthropic gets top-level `type: "object"`. */
export const screenshotInputSchema = z
  .object({
    target: z
      .enum(["display", "window"])
      .describe('Capture target: "display" (primary) or "window" (need not be focused)'),
    windowId: z
      .number()
      .int()
      .optional()
      .describe("Native window id from window_list; required when target is window"),
  })
  .superRefine((value, ctx) => {
    if (value.target === "window" && value.windowId === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "windowId is required when target is window",
        path: ["windowId"],
      });
    }
  });

export type ScreenshotOutput = {
  width: number;
  height: number;
  mimeType: string;
  base64: string;
  /** Screen-space rect of the captured region. */
  bounds: ScreenshotBounds;
  /** Screen units per image pixel (x). */
  scaleX: number;
  /** Screen units per image pixel (y). */
  scaleY: number;
};

export const screenshotCapability = defineCapability({
  name: "screenshot",
  description: [
    "Capture a PNG of the primary display or a top-level window (window need not be focused).",
    "Returns image pixels plus screen-space bounds and scaleX/scaleY. To click a point in this image, prefer mouse_click_image (host remaps); do not compute screen coords yourself.",
    "If a control is small, dense, or illegible, call screenshot_zoom once on that image rect before mouse_click_image — do not chain zoom→zoom.",
    SCREEN_COORD_DESC,
    "Images are downscaled to max long edge 1280. On capture_unavailable the pixels are not usable; on macOS os_permission_denied means Screen Recording is required.",
    "Use to orient or to verify after a batch of actions or after a UI transition — not after every micro-step.",
  ].join(" "),
  risk: "medium",
  inputSchema: screenshotInputSchema,
  enabledWhen: windowAutomationEnabled,
  providesScreenshotGeometry: true,
  usesImageModelOutput: true,
});
