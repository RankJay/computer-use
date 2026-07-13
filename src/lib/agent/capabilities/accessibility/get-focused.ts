import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityGetFocusedInputSchema = z.object({
  windowId: z
    .number()
    .int()
    .optional()
    .describe("Optional window id to require the focused element belong to that process"),
});

export const accessibilityGetFocusedCapability = defineCapability({
  name: "accessibility_get_focused",
  description:
    "Return the currently focused accessibility element as one outline line with a usable ref. Prefer after typing/tabbing instead of re-snapshotting.",
  risk: "high",
  inputSchema: accessibilityGetFocusedInputSchema,
  enabledWhen: uiAutomationEnabled,
});
