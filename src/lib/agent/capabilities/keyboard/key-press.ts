import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const keyPressInputSchema = z.object({
  key: z.string().min(1).describe("Key to press (e.g. enter, tab, up, down, a, f5)"),
  count: z.number().int().min(1).optional().describe("Number of press+release cycles (default 1)"),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const keyPressCapability = defineCapability({
  name: "key_press",
  description:
    "Press and release a key n times. Use for arrow navigation, Tab traversal, Enter confirm. Prefer accessibility tools when a ref exists.",
  risk: "high",
  inputSchema: keyPressInputSchema,
  enabledWhen: uiAutomationEnabled,
});
