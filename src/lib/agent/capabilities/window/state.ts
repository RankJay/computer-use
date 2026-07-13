import { z } from "zod";

import { defineCapability } from "../types";

export const windowStateInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
  op: z
    .enum(["minimize", "maximize", "restore", "close"])
    .describe(
      "Window state operation. On macOS, maximize and restore return action_unavailable — use resize or minimize/close instead.",
    ),
});

export type WindowStateOutput = {
  ok: boolean;
  windowId: number;
  op: string;
};

export const windowStateCapability = defineCapability({
  name: "window_state",
  description:
    "Minimize, maximize, restore, or close a top-level window by id. maximize/restore are Windows-only; on macOS they return action_unavailable.",
  risk: "high",
  inputSchema: windowStateInputSchema,
});
