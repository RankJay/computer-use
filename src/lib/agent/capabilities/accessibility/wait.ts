import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityWaitInputSchema = z
  .object({
    hwnd: z.number().int().describe("Native window handle from window_list"),
    name: z.string().min(1).optional(),
    nameContains: z.string().min(1).optional(),
    automationId: z.string().min(1).optional(),
    role: z.string().optional(),
    enabled: z.boolean().optional(),
    visible: z.boolean().optional(),
    limit: z.number().int().min(1).max(20).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(30000)
      .optional()
      .describe("Absolute wait budget in ms (default 5000)"),
    scopeReference: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      value.name != null ||
      value.nameContains != null ||
      value.automationId != null ||
      value.role != null,
    { message: "Provide at least one of name, nameContains, automationId, or role" },
  );

export const accessibilityWaitCapability = defineCapability({
  name: "accessibility_wait",
  description:
    "Poll an accessibility query until a match appears or timeoutMs elapses. Prefer this over generic wait + find loops for UI readiness.",
  risk: "high",
  inputSchema: accessibilityWaitInputSchema,
  enabledWhen: uiAutomationEnabled,
});
