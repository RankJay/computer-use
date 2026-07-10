import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const windowResizeInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
  width: z.number().int().positive().describe("Target client area width in pixels"),
  height: z.number().int().positive().describe("Target client area height in pixels"),
});

export type WindowResizeOutput = {
  ok: boolean;
  hwnd: number;
  width: number;
  height: number;
};

export const windowResizeCapability = defineCapability({
  name: "window_resize",
  description: "Resize a top-level window to the given width and height.",
  risk: "medium",
  inputSchema: windowResizeInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      hwnd: number;
      width: number;
      height: number;
    }>("window_resize", {
      hwnd: input.hwnd,
      width: input.width,
      height: input.height,
    });
    return {
      ok: result.ok,
      hwnd: result.hwnd,
      width: result.width,
      height: result.height,
    } satisfies WindowResizeOutput;
  },
});
