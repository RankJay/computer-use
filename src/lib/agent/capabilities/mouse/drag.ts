import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseDragInputSchema = z.object({
  x0: z.number().int().describe("Start screen x"),
  y0: z.number().int().describe("Start screen y"),
  x1: z.number().int().describe("End screen x"),
  y1: z.number().int().describe("End screen y"),
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
