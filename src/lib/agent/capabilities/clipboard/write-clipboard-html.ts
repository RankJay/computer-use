import { z } from "zod";

import { defineCapability } from "../types";

export const writeClipboardHtmlInputSchema = z.object({
  html: z.string().describe("HTML markup to copy to the system clipboard"),
});

export type WriteClipboardHtmlInput = z.infer<typeof writeClipboardHtmlInputSchema>;

export type WriteClipboardHtmlOutput = {
  bytes: number;
};

export const writeClipboardHtmlCapability = defineCapability({
  name: "write_clipboard_html",
  description: "Copy HTML to the system clipboard (also sets a plain-text alternative)",
  risk: "medium",
  inputSchema: writeClipboardHtmlInputSchema,
});
