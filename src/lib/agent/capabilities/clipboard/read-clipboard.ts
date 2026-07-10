import { z } from "zod";

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
});
