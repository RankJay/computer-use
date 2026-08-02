import type { UIMessage } from "ai";

import type { EntitlementPolicy } from "@/lib/entitlements";
import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { EscalationPort } from "./control/escalation-port";
import type { OsLease } from "./control/os-lease";
import type { RuntimeEvent, RuntimeEventPayload } from "./events";

/**
 * Static pack AttemptControl builds for start/retry (ADR 0002).
 * Not the live runtime bag — see LiveRunContext.
 */
export type RunConfig = {
  prompt: string;
  modelId: string;
  chatMessages?: UIMessage[];
  settings: AppSettings;
  secrets: AppSecrets;
  /** When true, producers should omit appending a new user message row. */
  isRetry?: boolean;
  /** Persist capability approval into settings (once-per-class). */
  persistApproval?: (capability: string) => Promise<void>;
  /** Mandate standing policy for Capability PermissionPolicy overlay. */
  standingPolicy?: StandingPolicyDocument | null;
};

/**
 * Runtime bag RunController assembles once at produceRun.
 * Threaded opaque through producer → agent → capabilities.
 * standingPolicy lives only on `config` (no top-level duplicate).
 */
export type LiveRunContext = {
  config: RunConfig;
  attemptId: string;
  signal: AbortSignal;
  append: (payload: RuntimeEventPayload) => unknown;
  escalationPort: EscalationPort;
  entitlements?: EntitlementPolicy;
  osLease?: OsLease;
  getEventLog?: () => readonly RuntimeEvent[];
};

/** @deprecated Use LiveRunContext */
export type RunExecutionContext = LiveRunContext;
