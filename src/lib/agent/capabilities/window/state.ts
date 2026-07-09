import { z } from "zod";

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
});
