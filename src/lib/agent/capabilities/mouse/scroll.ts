import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseScrollInputSchema = z.object({
  dx: z.number().int().describe("Horizontal scroll ticks (positive = right)"),
  dy: z.number().int().describe("Vertical scroll ticks (positive = up / away)"),
  x: z.number().int().optional().describe("Optional screen x before scrolling"),
  y: z.number().int().optional().describe("Optional screen y before scrolling"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseScrollCapability = defineCapability({
  name: "mouse_scroll",
  description:
    "Scroll the mouse wheel by dx/dy ticks at the current cursor (or optional screen coords). Prefer accessibility_scroll_element when a ref exists.",
  risk: "high",
  inputSchema: mouseScrollInputSchema,
  enabledWhen: uiAutomationEnabled,
});
