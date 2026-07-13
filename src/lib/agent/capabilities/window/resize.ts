import { z } from "zod";

import { windowAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const windowResizeInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
  width: z.number().int().positive().describe("Target client area width in pixels"),
  height: z.number().int().positive().describe("Target client area height in pixels"),
});

export type WindowResizeOutput = {
  ok: boolean;
  windowId: number;
  width: number;
  height: number;
};

export const windowResizeCapability = defineCapability({
  name: "window_resize",
  description: "Resize a top-level window to the given width and height.",
  risk: "medium",
  inputSchema: windowResizeInputSchema,
  enabledWhen: windowAutomationEnabled,
});
