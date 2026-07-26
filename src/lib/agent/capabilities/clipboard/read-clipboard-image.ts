import { z } from "zod";

import { defineCapability } from "../types";

export const readClipboardImageInputSchema = z.object({});

export type ReadClipboardImageOutput = {
  width: number;
  height: number;
  mimeType: string;
  base64: string;
  empty: boolean;
};

export const readClipboardImageCapability = defineCapability({
  name: "read_clipboard_image",
  description: "Read an image from the system clipboard as PNG base64",
  risk: "medium",
  inputSchema: readClipboardImageInputSchema,
  usesImageModelOutput: true,
});
