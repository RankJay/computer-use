import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
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
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{
      name: string;
      value: string | null;
      set: boolean;
    }>("get_env", { name: input.name });

    return {
      name: result.name,
      value: result.value,
      set: result.set,
    } satisfies GetEnvOutput;
  },
});
