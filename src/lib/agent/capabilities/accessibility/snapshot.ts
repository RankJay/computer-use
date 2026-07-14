import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilitySnapshotInputSchema = z
  .object({
    windowId: z.number().int().optional().describe("Native window id from window_list"),
    reference: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional root ref (e.g. e14@3:12345). When set, emits that subtree with children forced open.",
      ),
    maxDepth: z.number().int().min(1).max(20).optional().describe("Maximum tree depth"),
    maxElements: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe("Maximum interactive elements to include"),
  })
  .refine((value) => value.windowId !== undefined || value.reference !== undefined, {
    message: "Provide windowId and/or reference",
  });

export type AccessibilitySnapshotInput = z.infer<typeof accessibilitySnapshotInputSchema>;

export type AccessibilityTextOutput = {
  text: string;
  generation: number | null;
  visited?: number | null;
  emitted?: number | null;
  truncated?: boolean | null;
  truncationReason?: string | null;
};

export const accessibilitySnapshotCapability = defineCapability({
  name: "accessibility_snapshot",
  description:
    "Capture a compact accessibility outline for a window (windowId) or a scoped subtree (reference). Returns indented text lines with refs like e3@2:12345. Identical consecutive siblings are compressed after 3; truncation is reported via truncated/truncationReason and a [truncated:…] footer. Use reference to expand a Pane/collapsed node instead of a separate expand tool.",
  risk: "high",
  inputSchema: accessibilitySnapshotInputSchema,
  enabledWhen: uiAutomationEnabled,
});
