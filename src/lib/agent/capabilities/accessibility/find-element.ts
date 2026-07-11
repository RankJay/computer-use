import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityFindElementInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle to search within"),
  nameContains: z.string().min(1).describe("Case-insensitive substring of the element name"),
  role: z
    .string()
    .optional()
    .describe("Optional control role filter such as button, edit, link/hyperlink, or menuitem"),
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
  visited?: number | null;
  emitted?: number | null;
  truncated?: boolean | null;
  truncationReason?: string | null;
};

export const accessibilityFindElementCapability = defineCapability({
  name: "accessibility_find_element",
  description:
    "Compat search by nameContains (+ optional role). Prefer accessibility_query for automationId, exact name, state filters, limit, or scoped search. Tries exact name+role, then substring+role, then name-only (labeled match=name_only — never silent).",
  risk: "high",
  inputSchema: accessibilityFindElementInputSchema,
  enabledWhen: uiAutomationEnabled,
});
