import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const readClipboardInputSchema = z.object({});

export type ReadClipboardOutput = {
  text: string;
  empty: boolean;
};

export const readClipboardCapability = defineCapability({
  name: "read_clipboard",
  description: "Read plain text from the system clipboard",
  risk: "medium",
  inputSchema: readClipboardInputSchema,
  execute: async () => {
    const result = await invokeCapabilityCommand<{
      text: string;
      empty: boolean;
    }>("read_clipboard", {});

    return {
      text: result.text,
      empty: result.empty,
    } satisfies ReadClipboardOutput;
  },
});
