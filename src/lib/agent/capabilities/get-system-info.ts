import { z } from "zod";

import { invokeCapabilityCommand } from "./tauri-invoke";
import { defineCapability } from "./types";

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
  execute: async () => {
    const result = await invokeCapabilityCommand<{
      os: string;
      arch: string;
      family: string;
      hostname: string | null;
      username: string | null;
      cpu_count: number;
      platform_detail: string;
    }>("get_system_info", {});

    return {
      os: result.os,
      arch: result.arch,
      family: result.family,
      hostname: result.hostname,
      username: result.username,
      cpuCount: result.cpu_count,
      platformDetail: result.platform_detail,
    } satisfies GetSystemInfoOutput;
  },
});
