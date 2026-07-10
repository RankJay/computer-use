import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const windowStateInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
  op: z
    .enum(["minimize", "maximize", "restore", "close"])
    .describe("Window state operation to apply"),
});

export type WindowStateOutput = {
  ok: boolean;
  hwnd: number;
  op: string;
};

export const windowStateCapability = defineCapability({
  name: "window_state",
  description: "Minimize, maximize, restore, or close a top-level window by handle.",
  risk: "high",
  inputSchema: windowStateInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{ ok: boolean; hwnd: number; op: string }>(
      "window_state",
      {
        hwnd: input.hwnd,
        op: input.op,
      },
    );
    return {
      ok: result.ok,
      hwnd: result.hwnd,
      op: result.op,
    } satisfies WindowStateOutput;
  },
});
