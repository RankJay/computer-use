import { z } from "zod";

import { windowAutomationEnabled } from "../shared/ui-automation";
import { defineCapability } from "../types";

export const windowListInputSchema = z.object({});

export type WindowListOutput = {
  text: string;
};

export const windowListCapability = defineCapability({
  name: "window_list",
  description:
    "List visible top-level windows with window id, process name, and title for window management. Prefer this before launching an app that may already be open.",
  risk: "low",
  inputSchema: windowListInputSchema,
  enabledWhen: windowAutomationEnabled,
});
