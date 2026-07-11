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
import { formatToolStreamError } from "@/lib/agent/tool-errors";
import type { RunAgentFinishReason } from "@/lib/agent/types";
import {
  emitUsageAndBudget,
  finishAssistantMessage,
  syncAssistantMessage,
  type MessageSyncState,
} from "@/lib/agent/ui-stream-sync";
import { notifyIfUnfocused } from "@/lib/native/notification";
import { createBudgetGuard, createBudgetTracker } from "@/lib/session/control/budget";
import type { PermissionWaiter } from "@/lib/session/control/run-controller";
import type { RuntimeEventPayload } from "@/lib/session/events";
import type { AppSettings } from "@/lib/settings/types";

/** Reads toolCallId without AI SDK guards (empty TOOLS generics collapse ToolUIPart to never). */
function getPartToolCallId(part: object): string | null {
  if (!("toolCallId" in part)) return null;
  const id = Reflect.get(part, "toolCallId");
  return typeof id === "string" ? id : null;
}

export type RunStreamCoordinatorDeps = {
  taskId: string;
  model: LanguageModel | LanguageModelV4;
  modelId: string;
  system: string;
  messages: UIMessage[];
  settings: AppSettings;
  signal: AbortSignal;
  append: (payload: RuntimeEventPayload) => unknown;
  workspaceRoot: string;
  createPermissionWaiter: (callId: string) => PermissionWaiter;
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
    taskId: deps.taskId,
    settings: deps.settings,
    workspaceRoot: deps.workspaceRoot,
    createPermissionWaiter: deps.createPermissionWaiter,
    resolveToolPart,
  };

  const tools = buildAgentTools(runnerDeps);

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

    const assistantMessageId = `assistant-${deps.taskId}`;
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
        emit({ type: "task.status_changed", status: "streaming" });
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
