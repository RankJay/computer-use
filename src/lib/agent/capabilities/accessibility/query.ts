import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityQueryInputSchema = z
  .object({
    hwnd: z.number().int().describe("Native window handle from window_list"),
    name: z.string().min(1).optional().describe("Exact name match (case-insensitive)"),
    nameContains: z.string().min(1).optional().describe("Substring name match"),
    automationId: z.string().min(1).optional().describe("Exact AutomationId"),
    role: z.string().optional().describe("Control role, e.g. button, edit, link, menuitem"),
    enabled: z.boolean().optional().describe("Filter by enabled state"),
    visible: z.boolean().optional().describe("Filter by on-screen (not offscreen)"),
    limit: z.number().int().min(1).max(20).optional().describe("Max candidates (default 5)"),
    waitMs: z
      .number()
      .int()
      .min(0)
      .max(30000)
      .optional()
      .describe("Extra poll budget while waiting for a match"),
    scopeReference: z
      .string()
      .min(1)
      .optional()
      .describe("Optional ref to search within that subtree only"),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.nameContains !== undefined ||
      value.automationId !== undefined ||
      value.role !== undefined,
    { message: "Provide at least one of name, nameContains, automationId, or role" },
  );

export const accessibilityQueryCapability = defineCapability({
  name: "accessibility_query",
  description:
    "Deterministic accessibility search. Prefer this over find_element when you need automationId, exact name, state filters, limit, or a scoped subtree. Never silently drops the role filter.",
  risk: "high",
  inputSchema: accessibilityQueryInputSchema,
  enabledWhen: uiAutomationEnabled,
});
