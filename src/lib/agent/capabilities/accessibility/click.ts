import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityClickInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref from snapshot or find_element"),
});

export type AccessibilityActionOutput = {
  ok: boolean;
  method: string;
  foregrounded: boolean;
};

export const accessibilityClickCapability = defineCapability({
  name: "accessibility_click",
  description:
    "Click an accessibility element by ref. Scrolls into view, walks up to nearest Hyperlink for browser links. Edit/Document use synthetic click; others try legacy/invoke/enter then synthetic click. Pattern-not-found falls through instead of failing hard.",
  risk: "high",
  inputSchema: accessibilityClickInputSchema,
  enabledWhen: uiAutomationEnabled,
});
