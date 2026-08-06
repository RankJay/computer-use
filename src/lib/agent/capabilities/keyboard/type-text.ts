import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const typeTextInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Literal text to type into the focused control (Unicode; not shell/xdotool)"),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const typeTextCapability = defineCapability({
  name: "type_text",
  description:
    "Type literal text into the currently focused control. Prefer accessibility_send_keys / accessibility_set_value when a windowId or element ref exists. After screenshot → mouse_click_image to focus a field, use this (or write_clipboard + hotkey ctrl/cmd+v) — never run_shell/xdotool.",
  risk: "high",
  inputSchema: typeTextInputSchema,
  enabledWhen: uiAutomationEnabled,
});
