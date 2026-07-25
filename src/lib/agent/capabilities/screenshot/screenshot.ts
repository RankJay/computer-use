import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { windowAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

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

export type ScreenshotBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenshotOutput = {
  width: number;
  height: number;
  mimeType: string;
  base64: string;
  /** Screen-space rect of the captured region. */
  bounds: ScreenshotBounds;
  /**
   * Screen units per image pixel (x-axis). Map image (px, py) → screen:
   * `bounds.x + px * scale`, `bounds.y + py * (bounds.height / height)`.
   */
  scale: number;
};

export const screenshotCapability = defineCapability({
  name: "screenshot",
  description: [
    "Capture a PNG of the primary display or a top-level window (window need not be focused).",
    "Returns image pixels plus screen-space bounds and scale so image coords map to mouse_*/accessibility_element_at_point.",
    SCREEN_COORD_DESC,
    "Images are downscaled to max long edge 1280. On capture_unavailable the pixels are not usable; on macOS os_permission_denied means Screen Recording is required.",
  ].join(" "),
  risk: "medium",
  inputSchema: screenshotInputSchema,
  enabledWhen: windowAutomationEnabled,
});
