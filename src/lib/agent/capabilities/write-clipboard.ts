import { z } from "zod";

import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

export const writeClipboardInputSchema = z.object({
  text: z.string().describe("Plain text to copy to the system clipboard"),
});

export type WriteClipboardInput = z.infer<typeof writeClipboardInputSchema>;

export type WriteClipboardOutput = {
  bytes: number;
};

export const writeClipboardCapability = defineCapability({
  name: "write_clipboard",
  description: "Copy plain text to the system clipboard",
  risk: "medium",
  inputSchema: writeClipboardInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{ bytes: number }>("write_clipboard", {
      text: input.text,
    });

    return {
      bytes: result.bytes,
    } satisfies WriteClipboardOutput;
  },
});
