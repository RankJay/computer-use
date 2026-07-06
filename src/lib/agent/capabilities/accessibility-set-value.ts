import { z } from "zod";

import { uiAutomationEnabled } from "./accessibility/shared";
import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const accessibilitySetValueInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
  text: z.string().describe("Text to set in the target field"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilitySetValueCapability = defineCapability({
  name: "accessibility_set_value",
  description:
    "Set text in an accessibility element by ref using value pattern, legacy access, or send_keys.",
  risk: "high",
  inputSchema: accessibilitySetValueInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      method: string;
      foregrounded: boolean;
    }>("accessibility_set_value", {
      reference: input.reference,
      text: input.text,
    });

    return {
      ok: result.ok,
      method: result.method,
      foregrounded: result.foregrounded,
    } satisfies AccessibilityActionOutput;
  },
});
