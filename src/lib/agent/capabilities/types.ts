import type { z } from "zod";

import type { RuntimeEvent } from "@/lib/session/events";
import type { AppSettings } from "@/lib/settings/types";

export type CapabilityRisk = "low" | "medium" | "high";

export type CapabilityError = {
  code: string;
  message: string;
};

export type CapabilityContext = {
  workspaceRoot: string;
  settings: AppSettings;
  emit: (event: RuntimeEvent) => void;
  callId: string;
  taskId: string;
};

export type CapabilityDefinition = {
  name: string;
  description: string;
  risk: CapabilityRisk;
  inputSchema: z.ZodType;
  parseInput: (input: unknown) => unknown;
  execute: (input: unknown, ctx: CapabilityContext) => Promise<unknown>;
};

export function defineCapability<S extends z.ZodType>(config: {
  name: string;
  description: string;
  risk: CapabilityRisk;
  inputSchema: S;
  execute: (input: z.infer<S>, ctx: CapabilityContext) => Promise<unknown>;
}): CapabilityDefinition {
  return {
    name: config.name,
    description: config.description,
    risk: config.risk,
    inputSchema: config.inputSchema,
    parseInput: (input) => config.inputSchema.parse(input),
    execute: (input, ctx) => config.execute(config.inputSchema.parse(input), ctx),
  };
}

export type InvokeCapabilityResult =
  | { ok: true; output: unknown }
  | { ok: false; denied: true }
  | { ok: false; error: CapabilityError };

export type PermissionWaiter = {
  waitForDecision: () => Promise<"approved" | "denied">;
};

export type InvokeCapabilityDeps = {
  emit: (event: RuntimeEvent) => void;
  taskId: string;
  settings: AppSettings;
  workspaceRoot: string;
  createPermissionWaiter?: (request: {
    callId: string;
    capability: string;
    input: unknown;
    risk: CapabilityRisk;
  }) => PermissionWaiter;
  executeNative?: (capability: string, input: unknown) => Promise<unknown>;
};
