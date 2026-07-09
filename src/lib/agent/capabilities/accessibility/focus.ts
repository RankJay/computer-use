import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityFocusInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityFocusCapability = defineCapability({
  name: "accessibility_focus",
  description:
    "Bring the target window to the foreground and focus an accessibility element by ref.",
  risk: "high",
  inputSchema: accessibilityFocusInputSchema,
  enabledWhen: uiAutomationEnabled,
});
