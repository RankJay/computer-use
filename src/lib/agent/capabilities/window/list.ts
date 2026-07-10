import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const windowListInputSchema = z.object({});

export type WindowListOutput = {
  text: string;
};

export const windowListCapability = defineCapability({
  name: "window_list",
  description:
    "List visible top-level windows with handle, process name, and title for window management.",
  risk: "low",
  inputSchema: windowListInputSchema,
  execute: async () => {
    const result = await invokeCapabilityCommand<{ text: string }>("window_list", {});
    return { text: result.text } satisfies WindowListOutput;
  },
});
