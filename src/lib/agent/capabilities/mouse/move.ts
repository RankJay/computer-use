import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseMoveInputSchema = z.object({
  x: z.number().int().describe("Screen x in physical pixels (same space as window_move)"),
  y: z.number().int().describe("Screen y in physical pixels (same space as window_move)"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseMoveCapability = defineCapability({
  name: "mouse_move",
  description:
    "Move the system cursor to physical screen coordinates. Prefer accessibility_click when an element ref is available.",
  risk: "high",
  inputSchema: mouseMoveInputSchema,
  enabledWhen: uiAutomationEnabled,
});
