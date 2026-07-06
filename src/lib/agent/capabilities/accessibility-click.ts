import { z } from "zod";

import { uiAutomationEnabled } from "./accessibility/shared";
import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const accessibilityClickInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityClickCapability = defineCapability({
  name: "accessibility_click",
  description:
    "Click an accessibility element by ref. Scrolls into view, walks up to nearest Hyperlink for browser links, then tries legacy/invoke/enter/synthetic click.",
  risk: "high",
  inputSchema: accessibilityClickInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      ok: boolean;
      method: string;
      foregrounded: boolean;
    }>("accessibility_click", {
      reference: input.reference,
    });

    return {
      ok: result.ok,
      method: result.method,
      foregrounded: result.foregrounded,
    } satisfies AccessibilityActionOutput;
  },
});
