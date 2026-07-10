import { z } from "zod";

import { defineCapability } from "../types";

export const processListInputSchema = z.object({});

export type ProcessListOutput = {
  text: string;
  count: number;
};

export const processListCapability = defineCapability({
  name: "process_list",
  description: "List running processes with PID and executable name.",
  risk: "low",
  inputSchema: processListInputSchema,
});
