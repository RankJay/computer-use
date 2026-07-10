import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseHoverInputSchema = z.object({
  x: z.number().int().describe("Screen x in physical pixels"),
  y: z.number().int().describe("Screen y in physical pixels"),
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
