import { z } from "zod";

import { defineCapability } from "../types";

export const writeClipboardImageInputSchema = z.object({
  base64: z.string().min(1).describe("PNG image encoded as base64 (no data: URL prefix)"),
  mimeType: z
    .literal("image/png")
    .optional()
    .describe("Image mime type; only image/png is supported"),
});

export type WriteClipboardImageInput = z.infer<typeof writeClipboardImageInputSchema>;

export type WriteClipboardImageOutput = {
  width: number;
  height: number;
  bytes: number;
};

export const writeClipboardImageCapability = defineCapability({
  name: "write_clipboard_image",
  description: "Copy a PNG image (base64) to the system clipboard",
  risk: "medium",
  inputSchema: writeClipboardImageInputSchema,
});
