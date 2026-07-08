import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const windowMoveInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
  x: z.number().int().describe("Target x position in screen coordinates"),
  y: z.number().int().describe("Target y position in screen coordinates"),
});

export type WindowMoveOutput = {
  ok: boolean;
  hwnd: number;
  x: number;
  y: number;
};

export const windowMoveCapability = defineCapability({
  name: "window_move",
  description: "Move a top-level window to the given screen coordinates.",
  risk: "medium",
  inputSchema: windowMoveInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      hwnd: number;
      x: number;
      y: number;
    }>("window_move", {
      hwnd: input.hwnd,
      x: input.x,
      y: input.y,
    });
    return {
      ok: result.ok,
      hwnd: result.hwnd,
      x: result.x,
      y: result.y,
    } satisfies WindowMoveOutput;
  },
});
