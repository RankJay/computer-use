import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";
import { mouseButtonSchema } from "./click";

export const mouseUpInputSchema = z.object({
  button: mouseButtonSchema.describe("Mouse button to release"),
  x: z
    .number()
    .int()
    .optional()
    .describe(`Optional screen x before releasing. ${SCREEN_COORD_DESC}`),
  y: z
    .number()
    .int()
    .optional()
    .describe(`Optional screen y before releasing. ${SCREEN_COORD_DESC}`),
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
