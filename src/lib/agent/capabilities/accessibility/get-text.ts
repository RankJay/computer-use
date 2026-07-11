import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityGetTextInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot, find, or query"),
});

export type AccessibilityGetTextOutput = {
  text: string;
  method: "text_pattern" | "text_descendants" | "empty" | string;
};

export const accessibilityGetTextCapability = defineCapability({
  name: "accessibility_get_text",
  description:
    "Read visible text for an accessibility element by ref (TextPattern document range, or Text descendant names). Use for dialog bodies and labels that snapshot skips.",
  risk: "high",
  inputSchema: accessibilityGetTextInputSchema,
  enabledWhen: uiAutomationEnabled,
});
