import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  convertToModelMessages,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai";

import {
  buildAgentTools,
  type CapabilityRunnerDeps,
  type ToolPartLocation,
} from "@/lib/agent/capabilities";
import { prepareMessagesForModel } from "@/lib/agent/prepare-messages-for-model";
import { buildProviderWebSearchTools } from "@/lib/agent/provider-tools";
import { formatToolStreamError } from "@/lib/agent/tool-errors";
import type { RunAgentDeps, RunAgentFinishReason } from "@/lib/agent/types";
import {
  emitUsageAndBudget,
  finishAssistantMessage,
  syncAssistantMessage,
  type MessageSyncState,
} from "@/lib/agent/ui-stream-sync";
import { notifyIfUnfocused } from "@/lib/native/notification";
import { createBudgetGuard, createBudgetTracker } from "@/lib/session/control/budget";
import type { RuntimeEventPayload } from "@/lib/session/events";

/** Reads toolCallId without AI SDK guards (empty TOOLS generics collapse ToolUIPart to never). */
function getPartToolCallId(part: object): string | null {
  if (!("toolCallId" in part)) return null;
  const id = Reflect.get(part, "toolCallId");
  return typeof id === "string" ? id : null;
}

export type RunStreamCoordinatorDeps = RunAgentDeps & {
  model: LanguageModel | LanguageModelV4;
  system: string;
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

  const settings = deps.config.settings;
  const modelId = deps.config.modelId;

  const budget = createBudgetTracker(settings, deps.budgetStartedAt ?? Date.now());
  const streamAbort = new AbortController();
  deps.signal.addEventListener("abort", () => streamAbort.abort(), { once: true });

  const budgetGuard = createBudgetGuard(budget, (dimension) => {
    emit({ type: "budget.exceeded", dimension });
    streamAbort.abort();
  });

  const toolPartIndex = new Map<string, ToolPartLocation>();
  let latestMessage: UIMessage | null = null;

  const resolveToolPart = (callId: string): ToolPartLocation | null => {
    const cached = toolPartIndex.get(callId);
    if (cached) return cached;
    if (!latestMessage) return null;
    for (let index = 0; index < latestMessage.parts.length; index += 1) {
      const part = latestMessage.parts[index];
      if (!part) continue;
      const toolCallId = getPartToolCallId(part);
      if (toolCallId === callId) {
        const location = { messageId: latestMessage.id, partIndex: index };
        toolPartIndex.set(callId, location);
        return location;
      }
    }
    return null;
  };

  const runnerDeps: CapabilityRunnerDeps = {
    append: deps.append,
    attemptId: deps.attemptId,
    settings,
    workspaceRoot: settings.workspaceRoot,
    escalationPort: deps.escalationPort,
    resolveToolPart,
    entitlements: deps.entitlements,
    osLease: deps.osLease,
    standingPolicy: deps.config.standingPolicy,
    getEventLog: deps.getEventLog,
  };

  const tools = {
    ...buildAgentTools(runnerDeps),
    ...buildProviderWebSearchTools(modelId),
  };

  try {
    const modelMessages = await convertToModelMessages(prepareMessagesForModel(deps.messages), {
      ignoreIncompleteToolCalls: true,
      tools,
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
        emitUsageAndBudget(emit, modelId, budget, usage);
        finishAssistantMessage(emit, messageSync);
        messageSync = null;
        budgetGuard.checkAndStop();
      },
      onEnd: ({ finishReason }) => {
        if (finishReason === "stop") {
          notifyIfUnfocused({
            title: "Quietly done",
            body: "Your reply is ready. Click to hop back in.",
          });
        }
      },
    });

    const uiChunkStream = toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: true,
      sendSources: true,
      onError: formatToolStreamError,
    });

    const assistantMessageId = `assistant-${deps.attemptId}`;
    const seedMessage: UIMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: [],
    };

    for await (const message of readUIMessageStream({
      stream: uiChunkStream,
      message: seedMessage,
    })) {
      if (budgetGuard.checkAndStop()) {
        break;
      }

      if (!streamingStatusEmitted) {
        emit({ type: "attempt.status_changed", status: "streaming" });
        streamingStatusEmitted = true;
      }
      latestMessage = message;
      for (let index = 0; index < message.parts.length; index += 1) {
        const part = message.parts[index];
        if (!part) continue;
        const toolCallId = getPartToolCallId(part);
        if (toolCallId !== null) {
          toolPartIndex.set(toolCallId, { messageId: message.id, partIndex: index });
        }
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
        type: "attempt.failed",
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
