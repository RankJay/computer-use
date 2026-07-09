import { z } from "zod";

import { defineCapability } from "../types";

export const getSystemInfoInputSchema = z.object({});

export type GetSystemInfoOutput = {
  os: string;
  arch: string;
  family: string;
  hostname: string | null;
  username: string | null;
  cpuCount: number;
  platformDetail: string;
};

export const getSystemInfoCapability = defineCapability({
  name: "get_system_info",
  description: "Get OS, machine, and platform details for the host system",
  risk: "low",
  inputSchema: getSystemInfoInputSchema,
});
