import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const setEnvInputSchema = z.object({
  name: z.string().min(1).describe("Environment variable name"),
  value: z.string().describe("Value to set in the Actuate process environment"),
});

export type SetEnvOutput = {
  name: string;
  set: boolean;
};

export const setEnvCapability = defineCapability({
  name: "set_env",
  description:
    "Set an environment variable in the Actuate process environment. Does not change system-wide or shell profile variables.",
  risk: "high",
  inputSchema: setEnvInputSchema,
  execute: async (input) => {
    const result = await invokeCapabilityCommand<{ name: string; set: boolean }>("set_env", {
      name: input.name,
      value: input.value,
    });

    return { name: result.name, set: result.set } satisfies SetEnvOutput;
  },
});
