import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { LanguageModel, UIMessage } from "ai";

import type { EntitlementPolicy } from "@/lib/entitlements";
import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { EscalationPort } from "@/lib/session/control/escalation-port";
import type { OsLease } from "@/lib/session/control/os-lease";
import type { RuntimeEventPayload } from "@/lib/session/events";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

export type RunAgentDeps = {
  taskId: string;
  messages: UIMessage[];
  modelId: string;
  settings: AppSettings;
  secrets: AppSecrets;
  signal: AbortSignal;
  append: (payload: RuntimeEventPayload) => unknown;
  workspaceRoot: string;
  escalationPort: EscalationPort;
  entitlements?: EntitlementPolicy;
  osLease?: OsLease;
  standingPolicy?: StandingPolicyDocument | null;
  /** Test hook — bypasses provider resolution when set. */
  modelOverride?: LanguageModel | LanguageModelV4;
  /** Test hook — simulates an already-elapsed run for budget enforcement. */
  budgetStartedAt?: number;
};

export type RunAgentFinishReason = "stop" | "budget" | "cancelled" | "error";

export type RunAgentResult = {
  finishReason: RunAgentFinishReason;
};
