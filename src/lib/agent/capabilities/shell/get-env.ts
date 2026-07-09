import { z } from "zod";

import { defineCapability } from "../types";

export const getEnvInputSchema = z.object({
  name: z.string().min(1).describe("Environment variable name"),
});

export type GetEnvOutput = {
  name: string;
  value: string | null;
  set: boolean;
};

export const getEnvCapability = defineCapability({
  name: "get_env",
  description: "Read an environment variable from the Actuate process environment.",
  risk: "low",
  inputSchema: getEnvInputSchema,
});
