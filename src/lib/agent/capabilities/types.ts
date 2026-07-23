import type { z } from "zod";

import type { EscalationPort } from "@/lib/session/control/escalation-port";
import type { CapabilityFailedPayload } from "@/lib/session/events";
import type { RunExecutionContext } from "@/lib/session/run-execution-context";
import type { AppSettings } from "@/lib/settings/types";

import type { PermissionPolicy } from "./permission-policy";
import type { CapabilityRisk } from "./risk";

export type { CapabilityRisk } from "./risk";

export type CapabilityError = CapabilityFailedPayload["error"];

export type ToolPartLocation = {
  messageId: string;
  partIndex: number;
};

export type CapabilityDefinition<Name extends string = string> = {
  name: Name;
  description: string;
  risk: CapabilityRisk;
  /**
   * Hard-to-undo side effects (delete, kill, arbitrary shell/launch).
   * Used by permission mode `destructive-only`.
   */
  destructive?: boolean;
  inputSchema: z.ZodType;
  parseInput: (input: unknown) => unknown;
  /** When true, native invoke injects workspaceRoot into the Tauri payload. */
  needsWorkspaceRoot?: boolean;
  enabledWhen?: (settings: AppSettings) => boolean;
};

export function defineCapability<S extends z.ZodType, Name extends string>(config: {
  name: Name;
  description: string;
  risk: CapabilityRisk;
  destructive?: boolean;
  inputSchema: S;
  needsWorkspaceRoot?: boolean;
  enabledWhen?: (settings: AppSettings) => boolean;
}): CapabilityDefinition<Name> {
  return {
    name: config.name,
    description: config.description,
    risk: config.risk,
    destructive: config.destructive,
    inputSchema: config.inputSchema,
    parseInput: (input) => config.inputSchema.parse(input),
    needsWorkspaceRoot: config.needsWorkspaceRoot,
    enabledWhen: config.enabledWhen,
  };
}

export type InvokeCapabilityResult =
  | { ok: true; output: unknown }
  | { ok: false; denied: true }
  | { ok: false; error: CapabilityError };

export type CapabilityNativeInvoker = (
  capability: string,
  input: unknown,
  workspaceRoot: string,
) => Promise<unknown>;

/** Capability gate: shared run context with optional escalationPort for tests. */
export type CapabilityRunnerDeps = Omit<RunExecutionContext, "escalationPort"> & {
  /** Required when PermissionPolicy returns escalate. */
  escalationPort?: EscalationPort;
  /** Defaults to settings-backed policy. */
  permissionPolicy?: PermissionPolicy;
  invokeNative?: CapabilityNativeInvoker;
  resolveToolPart?: (callId: string) => ToolPartLocation | null;
};
