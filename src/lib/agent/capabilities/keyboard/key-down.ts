import { z } from "zod";

import { uiAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const keyDownInputSchema = z.object({
  key: z.string().min(1).describe("Key to hold (e.g. shift, ctrl, cmd, alt). Pair with key_up."),
});

export type KeyboardOkOutput = {
  ok: boolean;
};

export const keyDownCapability = defineCapability({
  name: "key_down",
  description:
    "Press and hold a key without releasing. Use for Shift multi-select, Ctrl/Cmd add-select, or modifier + drag.",
  risk: "high",
  inputSchema: keyDownInputSchema,
  enabledWhen: uiAutomationEnabled,
});
