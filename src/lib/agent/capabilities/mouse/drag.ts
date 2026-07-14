import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseDragInputSchema = z.object({
  x0: z.number().int().describe(`Start screen x. ${SCREEN_COORD_DESC}`),
  y0: z.number().int().describe(`Start screen y. ${SCREEN_COORD_DESC}`),
  x1: z.number().int().describe(`End screen x. ${SCREEN_COORD_DESC}`),
  y1: z.number().int().describe(`End screen y. ${SCREEN_COORD_DESC}`),
  button: mouseButtonSchema.optional().describe("Button held during drag (default left)"),
  steps: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Interpolation steps between start and end (default 12)"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseDragCapability = defineCapability({
  name: "mouse_drag",
  description:
    "Drag from (x0,y0) to (x1,y1) with a mouse button held. Use for canvas tools, list reordering, and sliders without a11y targets.",
  risk: "high",
  inputSchema: mouseDragInputSchema,
  enabledWhen: uiAutomationEnabled,
});
