import { z } from "zod";

import { defineCapability } from "../types";

export const windowMoveInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
  x: z.number().int().describe("Target x position in screen coordinates"),
  y: z.number().int().describe("Target y position in screen coordinates"),
});

export type WindowMoveOutput = {
  ok: boolean;
  windowId: number;
  x: number;
  y: number;
};

export const windowMoveCapability = defineCapability({
  name: "window_move",
  description: "Move a top-level window to the given screen coordinates.",
  risk: "medium",
  inputSchema: windowMoveInputSchema,
});
