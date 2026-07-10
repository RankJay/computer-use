import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseDownInputSchema = z.object({
  button: mouseButtonSchema.describe("Mouse button to press and hold"),
  x: z.number().int().optional().describe("Optional screen x before pressing"),
  y: z.number().int().optional().describe("Optional screen y before pressing"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseDownCapability = defineCapability({
  name: "mouse_down",
  description:
    "Press and hold a mouse button (optionally after moving). Pair with mouse_up for lasso select or sustained hold.",
  risk: "high",
  inputSchema: mouseDownInputSchema,
  enabledWhen: uiAutomationEnabled,
});
