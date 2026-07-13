import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityInvokeActionInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
  action: z
    .enum(["toggle", "expand", "collapse", "press", "select"])
    .describe("Accessibility action to invoke on the element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityInvokeActionCapability = defineCapability({
  name: "accessibility_invoke_action",
  description:
    "Trigger a specific accessibility action on an element by ref: toggle, expand, collapse, press, or select. Fails if the action is unavailable.",
  risk: "high",
  inputSchema: accessibilityInvokeActionInputSchema,
  enabledWhen: uiAutomationEnabled,
});
