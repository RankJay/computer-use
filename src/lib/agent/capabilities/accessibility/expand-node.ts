import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

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
  visited?: number | null;
  emitted?: number | null;
  truncated?: boolean | null;
  truncationReason?: string | null;
};

export const accessibilityExpandNodeCapability = defineCapability({
  name: "accessibility_expand_node",
  description: "Expand a collapsed accessibility node and return its subtree as compact text.",
  risk: "high",
  inputSchema: accessibilityExpandNodeInputSchema,
  enabledWhen: uiAutomationEnabled,
});
