import { z } from "zod";

import { windowAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const windowFocusInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
});

export type WindowFocusOutput = {
  ok: boolean;
  windowId: number;
};

export const windowFocusCapability = defineCapability({
  name: "window_focus",
  description:
    "Bring a top-level window to the foreground by id. On macOS, activates the app without Accessibility; raising a specific window uses Accessibility when granted.",
  risk: "medium",
  inputSchema: windowFocusInputSchema,
  enabledWhen: windowAutomationEnabled,
});
