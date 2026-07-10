import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseUpInputSchema = z.object({
  button: mouseButtonSchema.describe("Mouse button to release"),
  x: z.number().int().optional().describe("Optional screen x before releasing"),
  y: z.number().int().optional().describe("Optional screen y before releasing"),
});

export type MouseOkOutput = {
  ok: boolean;
};

export const mouseUpCapability = defineCapability({
  name: "mouse_up",
  description:
    "Release a previously held mouse button (optionally after moving). Pair with mouse_down.",
  risk: "high",
  inputSchema: mouseUpInputSchema,
  enabledWhen: uiAutomationEnabled,
});
