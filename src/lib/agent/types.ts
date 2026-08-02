import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { LanguageModel, UIMessage } from "ai";

import type { AttemptCompletedPayload } from "@/lib/session/events";
import type { LiveRunContext } from "@/lib/session/run-execution-context";

/** LiveRunContext + model-turn messages (and test hooks). */
export type RunAgentDeps = LiveRunContext & {
  messages: UIMessage[];
  /** Test hook — bypasses provider resolution when set. */
  modelOverride?: LanguageModel | LanguageModelV4;
  /** Test hook — simulates an already-elapsed run for budget enforcement. */
  budgetStartedAt?: number;
};

export type RunAgentFinishReason = AttemptCompletedPayload["finishReason"];

export type RunAgentResult = {
  finishReason: RunAgentFinishReason;
};
