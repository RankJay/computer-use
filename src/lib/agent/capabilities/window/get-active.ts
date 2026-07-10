import { z } from "zod";

import { invokeCapabilityCommand } from "../tauri-invoke";
import { defineCapability } from "../types";

export const getActiveWindowInputSchema = z.object({});

export type GetActiveWindowOutput = {
  hwnd: number;
  title: string | null;
  processName: string | null;
};

export const getActiveWindowCapability = defineCapability({
  name: "get_active_window",
  description: "Get the currently focused top-level window handle, title, and process name.",
  risk: "low",
  inputSchema: getActiveWindowInputSchema,
  execute: async () => {
    const result = await invokeCapabilityCommand<{
      hwnd: number;
      title: string | null;
      processName: string | null;
    }>("get_active_window", {});

    return {
      hwnd: result.hwnd,
      title: result.title,
      processName: result.processName,
    } satisfies GetActiveWindowOutput;
  },
});
