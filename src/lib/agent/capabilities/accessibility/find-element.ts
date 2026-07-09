import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityFindElementInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle to search within"),
  nameContains: z.string().min(1).describe("Case-insensitive substring of the element name"),
  role: z
    .string()
    .optional()
    .describe("Optional control role filter such as button, edit, or menuitem"),
  waitMs: z
    .number()
    .int()
    .min(0)
    .max(30000)
    .optional()
    .describe(
      "Poll for up to this many milliseconds before giving up (added to the 30s find budget)",
    ),
});

export type AccessibilityFindElementInput = z.infer<typeof accessibilityFindElementInputSchema>;

export type AccessibilityTextOutput = {
  text: string;
  generation: number | null;
};

export const accessibilityFindElementCapability = defineCapability({
  name: "accessibility_find_element",
  description:
    "Find up to five matching accessibility elements by name substring. Returns compact text lines with refs. Prefer role=hyperlink for YouTube video links; if none match, retries without role. Searches inside the page Document when present.",
  risk: "high",
  inputSchema: accessibilityFindElementInputSchema,
  enabledWhen: uiAutomationEnabled,
});
