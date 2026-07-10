import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const windowFocusInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
});

export type WindowFocusOutput = {
  ok: boolean;
  hwnd: number;
};

export const windowFocusCapability = defineCapability({
  name: "window_focus",
  description: "Bring a top-level window to the foreground by handle.",
  risk: "medium",
  inputSchema: windowFocusInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{ ok: boolean; hwnd: number }>("window_focus", {
      hwnd: input.hwnd,
    });
    return { ok: result.ok, hwnd: result.hwnd } satisfies WindowFocusOutput;
  },
});
