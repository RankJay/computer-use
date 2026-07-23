import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { LanguageModel, UIMessage } from "ai";

import type { TaskCompletedPayload } from "@/lib/session/events";
import type { RunExecutionContext } from "@/lib/session/run-execution-context";
import type { AppSecrets } from "@/lib/settings/types";

export type RunAgentDeps = RunExecutionContext & {
  messages: UIMessage[];
  modelId: string;
  secrets: AppSecrets;
  signal: AbortSignal;
  /** Test hook — bypasses provider resolution when set. */
  modelOverride?: LanguageModel | LanguageModelV4;
  /** Test hook — simulates an already-elapsed run for budget enforcement. */
  budgetStartedAt?: number;
};

export type RunAgentFinishReason = TaskCompletedPayload["finishReason"];

export type RunAgentResult = {
  finishReason: RunAgentFinishReason;
};
