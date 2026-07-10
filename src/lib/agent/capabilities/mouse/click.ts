import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const mouseButtonSchema = z.enum(["left", "right", "middle"]);

export const mouseClickInputSchema = z.object({
  button: mouseButtonSchema.describe("Mouse button to click"),
  count: z.number().int().min(1).optional().describe("Number of clicks (default 1)"),
  x: z.number().int().optional().describe("Optional screen x before clicking"),
  y: z.number().int().optional().describe("Optional screen y before clicking"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseClickCapability = defineCapability({
  name: "mouse_click",
  description:
    "Click left/right/middle button n times at the current cursor (or optional screen coords). Prefer accessibility_click when a ref exists.",
  risk: "high",
  inputSchema: mouseClickInputSchema,
  enabledWhen: uiAutomationEnabled,
});
