import type { LanguageModel, UIMessage } from "ai";

import type { PermissionWaiter } from "@/lib/agent/capabilities";
import type { RuntimeEvent } from "@/lib/session/events";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

export type CapabilityInvoker = (name: string, input: unknown, callId?: string) => Promise<unknown>;

export type RunAgentDeps = {
  taskId: string;
  messages: UIMessage[];
  modelId: string;
  settings: AppSettings;
  secrets: AppSecrets;
  signal: AbortSignal;
  emit: (payload: Omit<RuntimeEvent, "eventId" | "taskId" | "timestamp">) => void;
  createPermissionWaiter?: (request: {
    callId: string;
    capability: string;
    input: unknown;
    risk: "low" | "medium" | "high";
  }) => PermissionWaiter;
  executeNative?: (capability: string, input: unknown) => Promise<unknown>;
  /** Test hook — bypasses provider resolution when set. */
  modelOverride?: LanguageModel;
};

export type RunAgentFinishReason = "stop" | "budget" | "cancelled" | "error";

export type RunAgentResult = {
  finishReason: RunAgentFinishReason;
};
