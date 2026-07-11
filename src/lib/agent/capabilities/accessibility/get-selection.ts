import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityGetSelectionInputSchema = z.object({
  reference: z.string().min(1).describe("Selection container ref (list, tree, tab control, etc.)"),
});

export const accessibilityGetSelectionCapability = defineCapability({
  name: "accessibility_get_selection",
  description:
    "Read currently selected items from a SelectionPattern container and return outline lines with refs.",
  risk: "high",
  inputSchema: accessibilityGetSelectionInputSchema,
  enabledWhen: uiAutomationEnabled,
});
