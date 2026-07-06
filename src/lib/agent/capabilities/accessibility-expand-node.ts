import { z } from "zod";

import { uiAutomationEnabled } from "./accessibility/shared";
import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const accessibilityExpandNodeInputSchema = z.object({
  reference: z
    .string()
    .min(1)
    .describe("Element ref from a snapshot or find_element result, such as e14@3"),
});

export type AccessibilityExpandNodeInput = z.infer<typeof accessibilityExpandNodeInputSchema>;

export type AccessibilityTextOutput = {
  text: string;
  generation: number | null;
};

export const accessibilityExpandNodeCapability = defineCapability({
  name: "accessibility_expand_node",
  description: "Expand a collapsed accessibility node and return its subtree as compact text.",
  risk: "high",
  inputSchema: accessibilityExpandNodeInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      text: string;
      generation: number | null;
    }>("accessibility_expand_node", {
      reference: input.reference,
    });

    return {
      text: result.text,
      generation: result.generation,
    } satisfies AccessibilityTextOutput;
  },
});
