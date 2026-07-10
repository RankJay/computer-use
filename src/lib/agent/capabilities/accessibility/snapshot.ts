import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilitySnapshotInputSchema = z.object({
  hwnd: z.number().int().describe("Native window handle from window_list"),
  maxDepth: z.number().int().min(1).max(20).optional().describe("Maximum tree depth"),
  maxElements: z
    .number()
    .int()
    .min(1)
    .max(300)
    .optional()
    .describe("Maximum interactive elements to include"),
});

export type AccessibilitySnapshotInput = z.infer<typeof accessibilitySnapshotInputSchema>;

export type AccessibilityTextOutput = {
  text: string;
  generation: number | null;
};

export const accessibilitySnapshotCapability = defineCapability({
  name: "accessibility_snapshot",
  description:
    "Capture a compact accessibility outline for a window. Returns indented text lines with refs like e3@2. If the tree looks shallow (only Window/Pane), use accessibility_expand_node on a Pane ref or increase maxDepth.",
  risk: "high",
  inputSchema: accessibilitySnapshotInputSchema,
  enabledWhen: uiAutomationEnabled,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      text: string;
      generation: number | null;
    }>("accessibility_snapshot", {
      hwnd: input.hwnd,
      max_depth: input.maxDepth,
      max_elements: input.maxElements,
    });

    return {
      text: result.text,
      generation: result.generation,
    } satisfies AccessibilityTextOutput;
  },
});
