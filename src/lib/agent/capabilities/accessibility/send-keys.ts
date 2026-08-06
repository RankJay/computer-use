import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilitySendKeysInputSchema = z.object({
  windowId: z.number().int().describe("Native window id from window_list"),
  text: z
    .string()
    .min(1)
    .describe(
      "Keys to send. Use {ENTER}, {TAB}, ^v for paste (Ctrl+V on Windows, Cmd+V on macOS), / for YouTube search focus",
    ),
  reference: z
    .string()
    .min(1)
    .optional()
    .describe("Optional element ref to focus before sending keys"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilitySendKeysCapability = defineCapability({
  name: "accessibility_send_keys",
  description:
    "Send keyboard input to a window (or element ref). Foregrounds the window first. Prefer this over shell-based key sending. On focus_denied, click the field then type_text — avoid using xdotool/run_shell unless absolutely necessary.",
  risk: "high",
  inputSchema: accessibilitySendKeysInputSchema,
  enabledWhen: uiAutomationEnabled,
});
