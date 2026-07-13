import { z } from "zod";

import { defineCapability } from "../types";

export const getActiveWindowInputSchema = z.object({});

export type GetActiveWindowOutput = {
  windowId: number;
  title: string | null;
  processName: string | null;
};

export const getActiveWindowCapability = defineCapability({
  name: "get_active_window",
  description: "Get the currently focused top-level window id, title, and process name.",
  risk: "low",
  inputSchema: getActiveWindowInputSchema,
});
