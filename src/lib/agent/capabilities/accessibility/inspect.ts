import { z } from "zod";

import { defineCapability } from "../types";
import { uiAutomationEnabled } from "./shared";

export const accessibilityInspectInputSchema = z.object({
  reference: z.string().min(1).describe("Element ref to inspect"),
});

export type AccessibilityInspectOutput = {
  text: string;
  name: string;
  role: string | null;
  automationId: string;
  runtimeId: number[];
  enabled: boolean;
  offscreen: boolean;
  value?: string | null;
  rect?: [number, number, number, number] | null;
  patterns: string[];
};

export const accessibilityInspectCapability = defineCapability({
  name: "accessibility_inspect",
  description:
    "Dump properties and available actions/patterns for one ref (debugging / disambiguation). Not a full snapshot.",
  risk: "high",
  inputSchema: accessibilityInspectInputSchema,
  enabledWhen: uiAutomationEnabled,
});
