import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseHoverInputSchema = z.object({
  x: z.number().int().describe(`Screen x. ${SCREEN_COORD_DESC}`),
  y: z.number().int().describe(`Screen y. ${SCREEN_COORD_DESC}`),
  ms: z
    .number()
    .int()
    .min(0)
    .max(30_000)
    .optional()
    .describe("Dwell time in milliseconds (default 200)"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseHoverCapability = defineCapability({
  name: "mouse_hover",
  description:
    "Move the cursor to screen coordinates and optionally dwell for tooltips or hover-revealed menus.",
  risk: "high",
  inputSchema: mouseHoverInputSchema,
  enabledWhen: uiAutomationEnabled,
});
