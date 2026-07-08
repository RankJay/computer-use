import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilitySendKeysInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
  text: z
    .string()
    .min(1)
    .describe("Keys to send. Use {ENTER}, {TAB}, ^v for Ctrl+V, / for YouTube search focus"),
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
    "Send keyboard input to a window (or element ref). Foregrounds the window first. Prefer this over run_shell SendKeys.",
  risk: "high",
  inputSchema: accessibilitySendKeysInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      method: string;
      foregrounded: boolean;
    }>("accessibility_send_keys", {
      hwnd: input.hwnd,
      text: input.text,
      reference: input.reference,
    });

    return {
      ok: result.ok,
      method: result.method,
      foregrounded: result.foregrounded,
    } satisfies AccessibilityActionOutput;
  },
});
