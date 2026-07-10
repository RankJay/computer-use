import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityInvokeActionInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
  action: z
    .enum(["toggle", "expand", "collapse", "press", "select"])
    .describe("UIA action to invoke on the element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityInvokeActionCapability = defineCapability({
  name: "accessibility_invoke_action",
  description:
    "Trigger a specific UIA action on an accessibility element by ref: toggle, expand, collapse, press, or select. Fails if the pattern is unavailable.",
  risk: "high",
  inputSchema: accessibilityInvokeActionInputSchema,
  enabledWhen: uiAutomationEnabled,
});
