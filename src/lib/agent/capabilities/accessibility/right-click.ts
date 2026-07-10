import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityRightClickInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityRightClickCapability = defineCapability({
  name: "accessibility_right_click_element",
  description:
    "Right-click an accessibility element by ref to open its context menu. Scrolls into view and focuses first.",
  risk: "high",
  inputSchema: accessibilityRightClickInputSchema,
  enabledWhen: uiAutomationEnabled,
});
