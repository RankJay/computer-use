import { z } from "zod";

import { SCREEN_COORD_DESC } from "../shared/screen-coords";
import { defineCapability } from "../types";

export const windowMoveInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
  x: z.number().int().describe(`Target x. ${SCREEN_COORD_DESC}`),
  y: z.number().int().describe(`Target y. ${SCREEN_COORD_DESC}`),
});

export type WindowMoveOutput = {
  ok: boolean;
  windowId: number;
  x: number;
  y: number;
};

export const windowMoveCapability = defineCapability({
  name: "window_move",
  description:
    "Move a top-level window to the given screen coordinates (same space as mouse_* / accessibility hit-test).",
  risk: "medium",
  inputSchema: windowMoveInputSchema,
});
