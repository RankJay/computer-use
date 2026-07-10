import { z } from "zod";

import { defineCapability } from "../types";

export const readClipboardHtmlInputSchema = z.object({});

export type ReadClipboardHtmlOutput = {
  html: string;
  empty: boolean;
};

export const readClipboardHtmlCapability = defineCapability({
  name: "read_clipboard_html",
  description: "Read HTML from the system clipboard",
  risk: "medium",
  inputSchema: readClipboardHtmlInputSchema,
});
