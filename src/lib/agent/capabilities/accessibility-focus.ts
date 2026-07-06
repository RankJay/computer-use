import { z } from "zod";

import { uiAutomationEnabled } from "./accessibility/shared";
import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const accessibilityFocusInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityFocusCapability = defineCapability({
  name: "accessibility_focus",
  description:
    "Bring the target window to the foreground and focus an accessibility element by ref.",
  risk: "high",
  inputSchema: accessibilityFocusInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      method: string;
      foregrounded: boolean;
    }>("accessibility_focus", {
      reference: input.reference,
    });

    return {
      ok: result.ok,
      method: result.method,
      foregrounded: result.foregrounded,
    } satisfies AccessibilityActionOutput;
  },
});
