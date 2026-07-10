import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const keyUpInputSchema = z.object({
  key: z.string().min(1).describe("Key to release (must match a prior key_down)"),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const keyUpCapability = defineCapability({
  name: "key_up",
  description: "Release a previously held key from key_down.",
  risk: "high",
  inputSchema: keyUpInputSchema,
  enabledWhen: uiAutomationEnabled,
});
