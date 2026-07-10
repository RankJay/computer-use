import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityScrollElementInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
  direction: z
    .enum(["up", "down", "left", "right"])
    .describe("Scroll direction within the element (or nearest scrollable ancestor)"),
  amount: z.enum(["small", "large"]).optional().describe("Scroll step size; defaults to small"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityScrollElementCapability = defineCapability({
  name: "accessibility_scroll_element",
  description:
    "Scroll within a specific accessibility element by ref (or its nearest scrollable ancestor), not the whole screen.",
  risk: "high",
  inputSchema: accessibilityScrollElementInputSchema,
  enabledWhen: uiAutomationEnabled,
});
