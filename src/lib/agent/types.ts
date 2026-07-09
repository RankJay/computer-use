import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { LanguageModel, UIMessage } from "ai";

import type { PermissionWaiter } from "@/lib/session/control/run-controller";
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
  createPermissionWaiter: (callId: string) => PermissionWaiter;
  /** Test hook — bypasses provider resolution when set. */
  modelOverride?: LanguageModel | LanguageModelV4;
  /** Test hook — simulates an already-elapsed run for budget enforcement. */
  budgetStartedAt?: number;
};

export type RunAgentFinishReason = "stop" | "budget" | "cancelled" | "error";

export type RunAgentResult = {
  finishReason: RunAgentFinishReason;
};
