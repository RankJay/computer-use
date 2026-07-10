import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const hotkeyInputSchema = z.object({
  keys: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Ordered key chord, e.g. ["ctrl","c"], ["alt","f4"], ["win","r"], ["ctrl","shift","t"]',
    ),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const hotkeyCapability = defineCapability({
  name: "hotkey",
  description:
    "Press a key chord (down in order, up reverse). Prefer accessibility_set_value / accessibility_send_keys for text fields by ref.",
  risk: "high",
  inputSchema: hotkeyInputSchema,
  enabledWhen: uiAutomationEnabled,
});
