import type { z } from "zod";

import type { EntitlementPolicy } from "@/lib/entitlements";
import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { EscalationPort } from "@/lib/session/control/escalation-port";
import type { OsLease } from "@/lib/session/control/os-lease";
import type { RuntimeEvent, RuntimeEventPayload } from "@/lib/session/events";
import type { AppSettings } from "@/lib/settings/types";

import type { PermissionPolicy } from "./permission-policy";

export type CapabilityRisk = "low" | "medium" | "high";

export type CapabilityError = {
  code: string;
  message: string;
  details?: string;
  cause?: string;
};

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

export type CapabilityRunnerDeps = {
  append: (payload: RuntimeEventPayload) => unknown;
  taskId: string;
  settings: AppSettings;
  workspaceRoot: string;
  /** Required when PermissionPolicy returns escalate. */
  escalationPort?: EscalationPort;
  /** Defaults to settings-backed policy. */
  permissionPolicy?: PermissionPolicy;
  /** Mandate standing policy for PermissionPolicy overlay. */
  standingPolicy?: StandingPolicyDocument | null;
  invokeNative?: CapabilityNativeInvoker;
  resolveToolPart?: (callId: string) => ToolPartLocation | null;
  /** Commercial gate before PermissionPolicy. Optional for tests. */
  entitlements?: EntitlementPolicy;
  /** Desktop lock for UI-automation Capabilities. Optional = always grant (tests). */
  osLease?: OsLease;
  /** Attempt event log for resume-from-cursor (skip re-invoke of settled callIds). */
  getEventLog?: () => readonly RuntimeEvent[];
};
