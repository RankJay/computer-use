import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityElementAtPointInputSchema = z.object({
  x: z.number().int().describe("Screen X coordinate"),
  y: z.number().int().describe("Screen Y coordinate"),
  windowId: z
    .number()
    .int()
    .optional()
    .describe("Optional window id to require the hit element belong to that process"),
});

export const accessibilityElementAtPointCapability = defineCapability({
  name: "accessibility_element_at_point",
  description:
    "Resolve the accessibility element at a screen point (e.g. from a screenshot) and return an outline line with a usable ref.",
  risk: "high",
  inputSchema: accessibilityElementAtPointInputSchema,
  enabledWhen: uiAutomationEnabled,
});
