import { z } from "zod";

import { uiAutomationEnabled } from "./accessibility/shared";
import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const accessibilityListWindowsInputSchema = z.object({});

export type AccessibilityTextOutput = {
  text: string;
  generation: number | null;
};

export const accessibilityListWindowsCapability = defineCapability({
  name: "accessibility_list_windows",
  description:
    "List visible top-level windows with handle, process name, and title for UI automation.",
  risk: "low",
  inputSchema: accessibilityListWindowsInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async () => {
    const result = await invokeCapabilityCommand<{
      text: string;
      generation: number | null;
    }>("accessibility_list_windows", {});

    return {
      text: result.text,
      generation: result.generation,
    } satisfies AccessibilityTextOutput;
  },
});
