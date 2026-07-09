import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  convertToModelMessages,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai";

import { formatToolStreamError } from "@/lib/agent/tool-errors";
import type { RunAgentFinishReason } from "@/lib/agent/types";
import {
  emitUsageAndBudget,
  finishAssistantMessage,
  syncAssistantMessage,
  type MessageSyncState,
} from "@/lib/agent/ui-stream-sync";
import { createBudgetGuard, createBudgetTracker } from "@/lib/session/control/budget";
import type { RuntimeEventPayload } from "@/lib/session/events";
import type { AppSettings } from "@/lib/settings/types";

export type RunStreamCoordinatorDeps = {
  taskId: string;
  model: LanguageModel | LanguageModelV4;
  modelId: string;
  system: string;
  messages: UIMessage[];
  settings: AppSettings;
  signal: AbortSignal;
  append: (payload: RuntimeEventPayload) => unknown;
  budgetStartedAt?: number;
};

/**
 * Owns stream→events, status transitions, budget cadence, and finish outcomes.
 * BudgetGuard is the sole stopWhen authority (no isStepCount).
 */
export async function runStreamCoordinator(
  deps: RunStreamCoordinatorDeps,
): Promise<{ finishReason: RunAgentFinishReason }> {
  const emit = (payload: RuntimeEventPayload) => {
    deps.append(payload);
  };

  const budget = createBudgetTracker(deps.settings, deps.budgetStartedAt ?? Date.now());
  const streamAbort = new AbortController();
  deps.signal.addEventListener("abort", () => streamAbort.abort(), { once: true });

  const budgetGuard = createBudgetGuard(budget, (dimension) => {
    emit({ type: "budget.exceeded", dimension });
    streamAbort.abort();
  });

  const tools = {};

  try {
    const modelMessages = await convertToModelMessages(deps.messages, {
      ignoreIncompleteToolCalls: true,
    });

    if (budgetGuard.checkAndStop()) {
      return { finishReason: "budget" };
    }

    let messageSync: MessageSyncState | null = null;
    let streamingStatusEmitted = false;

    const result = streamText({
      model: deps.model,
      system: deps.system,
      messages: modelMessages,
      tools,
      abortSignal: streamAbort.signal,
      stopWhen: () => budgetGuard.checkAndStop(),
      onStepFinish: ({ usage }) => {
        budget.incrementStep();
        emitUsageAndBudget(emit, deps.modelId, budget, usage);
        finishAssistantMessage(emit, messageSync);
        messageSync = null;
        budgetGuard.checkAndStop();
      },
    });

    const uiChunkStream = toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: true,
      sendSources: true,
      onError: formatToolStreamError,
    });

    const assistantMessageId = `assistant-${deps.taskId}`;

    for await (const message of readUIMessageStream({
      stream: uiChunkStream,
      message: { id: assistantMessageId, role: "assistant", parts: [] },
    })) {
      if (budgetGuard.checkAndStop()) {
        break;
      }

      if (!streamingStatusEmitted) {
        emit({ type: "task.status_changed", status: "streaming" });
        streamingStatusEmitted = true;
      }
      messageSync = syncAssistantMessage(emit, message, messageSync);
    }

    finishAssistantMessage(emit, messageSync);

    if (budgetGuard.exceeded()) {
      return { finishReason: "budget" };
    }

    if (deps.signal.aborted) {
      return { finishReason: "cancelled" };
    }

    const finishReason = await result.finishReason;
    if (finishReason === "error") {
      emit({
        type: "task.failed",
        code: "provider",
        message: "The model stopped with an error.",
        recoverable: true,
      });
      return { finishReason: "error" };
    }

    return { finishReason: "stop" };
  } catch (error) {
    if (budgetGuard.exceeded()) {
      return { finishReason: "budget" };
    }

    if (deps.signal.aborted || streamAbort.signal.aborted) {
      return { finishReason: "cancelled" };
    }

    throw error;
  }
}
