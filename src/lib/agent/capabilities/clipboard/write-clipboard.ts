import { z } from "zod";

import { defineCapability } from "../types";

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
});
