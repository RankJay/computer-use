import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseMoveInputSchema = z.object({
  x: z.number().int().describe(`Screen x. ${SCREEN_COORD_DESC}`),
  y: z.number().int().describe(`Screen y. ${SCREEN_COORD_DESC}`),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseMoveCapability = defineCapability({
  name: "mouse_move",
  description:
    "Move the system cursor to screen coordinates (same space as window_move). Prefer accessibility_click when an element ref is available.",
  risk: "high",
  inputSchema: mouseMoveInputSchema,
  enabledWhen: uiAutomationEnabled,
});
