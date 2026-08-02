import type { z } from "zod";

import type { EntitlementPolicy } from "@/lib/entitlements";
import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { EscalationPort } from "@/lib/session/control/escalation-port";
import type { OsLease } from "@/lib/session/control/os-lease";
import type {
  CapabilityFailedPayload,
  RuntimeEvent,
  RuntimeEventPayload,
} from "@/lib/session/events";
import type { AppSettings } from "@/lib/settings/types";

import type { PermissionPolicy } from "./permission-policy";
import type { CapabilityRisk } from "./risk";
import { registerScreenshotGeometrySource } from "./shared/screenshot-geometry-sources";

export type { CapabilityRisk } from "./risk";

export type CapabilityError = CapabilityFailedPayload["error"];

export type ToolPartLocation = {
  messageId: string;
  partIndex: number;
};

export type CapabilityNativeInvoker = (
  capability: string,
  input: unknown,
  workspaceRoot: string,
) => Promise<unknown>;

/** Context for host-side capability adapters (`definition.run`). */
export type CapabilityHostRunContext = {
  workspaceRoot: string;
  invokeNative: CapabilityNativeInvoker;
  getEventLog?: () => readonly RuntimeEvent[];
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
  /**
   * Host adapter: runs after validate/authorize with already-parsed input.
   * When set, runner does not invoke a Tauri command named `name`.
   */
  run?: (input: unknown, ctx: CapabilityHostRunContext) => Promise<unknown>;
  /** Completed output carries screenshot geometry for mouse_click_image / screenshot_zoom. */
  providesScreenshotGeometry?: boolean;
  /** Tool result should be mapped to multimodal image content for the model. */
  usesImageModelOutput?: boolean;
};

export function defineCapability<S extends z.ZodType, Name extends string>(config: {
  name: Name;
  description: string;
  risk: CapabilityRisk;
  destructive?: boolean;
  inputSchema: S;
  needsWorkspaceRoot?: boolean;
  enabledWhen?: (settings: AppSettings) => boolean;
  run?: (input: z.infer<S>, ctx: CapabilityHostRunContext) => Promise<unknown>;
  providesScreenshotGeometry?: boolean;
  usesImageModelOutput?: boolean;
}): CapabilityDefinition<Name> {
  if (config.providesScreenshotGeometry) {
    registerScreenshotGeometrySource(config.name);
  }
  const hostRun = config.run;
  return {
    name: config.name,
    description: config.description,
    risk: config.risk,
    destructive: config.destructive,
    inputSchema: config.inputSchema,
    parseInput: (input) => config.inputSchema.parse(input),
    needsWorkspaceRoot: config.needsWorkspaceRoot,
    enabledWhen: config.enabledWhen,
    // Runner passes already-parsed input; erase schema at the definition boundary.
    run: hostRun ? (input, ctx) => hostRun(input as z.infer<S>, ctx) : undefined,
    providesScreenshotGeometry: config.providesScreenshotGeometry,
    usesImageModelOutput: config.usesImageModelOutput,
  };
}

export type InvokeCapabilityResult =
  | { ok: true; output: unknown }
  | { ok: false; denied: true }
  | { ok: false; error: CapabilityError };

/**
 * Capability gate deps — projected once from LiveRunContext in the stream coordinator.
 * Not a session packing hop; tests may construct this flat shape directly.
 */
export type CapabilityRunnerDeps = {
  attemptId: string;
  append: (payload: RuntimeEventPayload) => unknown;
  settings: AppSettings;
  workspaceRoot: string;
  standingPolicy?: StandingPolicyDocument | null;
  entitlements?: EntitlementPolicy;
  osLease?: OsLease;
  getEventLog?: () => readonly RuntimeEvent[];
  /** Required when PermissionPolicy returns escalate. */
  escalationPort?: EscalationPort;
  /** Defaults to settings-backed policy. */
  permissionPolicy?: PermissionPolicy;
  invokeNative?: CapabilityNativeInvoker;
  resolveToolPart?: (callId: string) => ToolPartLocation | null;
};
