import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const hotkeyInputSchema = z.object({
  keys: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'Ordered key chord. Examples: ["ctrl","c"], ["cmd","c"] / ["win","r"], ["alt","f4"], ["ctrl","shift","t"]. cmd/command/meta/super/win are the same modifier (Command on macOS, Win on Windows).',
    ),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const hotkeyCapability = defineCapability({
  name: "hotkey",
  description:
    "Press a key chord (down in order, up reverse). Use cmd/command on macOS or win on Windows for the platform modifier. Prefer accessibility_set_value / accessibility_send_keys for text fields by ref.",
  risk: "high",
  inputSchema: hotkeyInputSchema,
  enabledWhen: uiAutomationEnabled,
});
