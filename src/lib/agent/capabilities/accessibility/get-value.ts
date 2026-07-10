import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityGetValueInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityGetValueOutput = {
  value: string;
  kind: "text" | "range" | "empty";
  min?: number;
  max?: number;
  method: string;
};

export const accessibilityGetValueCapability = defineCapability({
  name: "accessibility_get_value",
  description:
    "Read the current value of an accessibility element by ref (text field, slider, progress, etc.).",
  risk: "high",
  inputSchema: accessibilityGetValueInputSchema,
  enabledWhen: uiAutomationEnabled,
});
