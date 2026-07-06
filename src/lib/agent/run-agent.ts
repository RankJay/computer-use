import {
  convertToModelMessages,
  isStepCount,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type LanguageModel,
} from "ai";

import type { InvokeCapabilityDeps } from "@/lib/agent/capabilities";
import { buildAgentTools } from "@/lib/agent/capabilities";
import { mapAgentError, resolveLanguageModel } from "@/lib/agent/model-provider";
import { buildSystemPrompt } from "@/lib/agent/prompts/system";
import type { RunAgentDeps, RunAgentResult } from "@/lib/agent/types";
import {
  emitUsageAndBudget,
  finishAssistantMessage,
  syncAssistantMessage,
  type MessageSyncState,
} from "@/lib/agent/ui-stream-sync";
import { createBudgetGuard, createBudgetTracker } from "@/lib/session/control/budget";
import type { RuntimeEvent, RuntimeEventPayload } from "@/lib/session/events";

function runtimeEventToPayload(event: RuntimeEvent): RuntimeEventPayload {
  const { eventId: _eventId, taskId: _taskId, timestamp: _timestamp, ...payload } = event;
  return payload;
}

export async function runAgentLoop(deps: RunAgentDeps): Promise<RunAgentResult> {
  const emit = deps.emit as (payload: RuntimeEventPayload) => void;

  if (deps.signal.aborted) {
    return { finishReason: "cancelled" };
  }

  let model: LanguageModel;
  try {
    model = deps.modelOverride ?? resolveLanguageModel(deps.modelId, deps.secrets);
  } catch (error) {
    const mapped = mapAgentError(error);
    emit({
      type: "task.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }

  const budget = createBudgetTracker(deps.settings, deps.budgetStartedAt ?? Date.now());
  const streamAbort = new AbortController();
  deps.signal.addEventListener("abort", () => streamAbort.abort(), { once: true });

  const budgetGuard = createBudgetGuard(budget, (dimension) => {
    emit({ type: "budget.exceeded", dimension });
    streamAbort.abort();
  });

  const invokeDeps: InvokeCapabilityDeps = {
    taskId: deps.taskId,
    settings: deps.settings,
    workspaceRoot: deps.settings.workspaceRoot,
    createPermissionWaiter: deps.createPermissionWaiter,
    executeNative: deps.executeNative,
    emit: (event) => emit(runtimeEventToPayload(event)),
  };

  const tools = buildAgentTools(invokeDeps);
  const system = buildSystemPrompt(deps.settings);

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
      model,
      system,
      messages: modelMessages,
      tools,
      abortSignal: streamAbort.signal,
      stopWhen: (context) => {
        if (budgetGuard.checkAndStop()) {
          return true;
        }

        return isStepCount(deps.settings.maxSteps)(context);
      },
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

    const mapped = mapAgentError(error);
    emit({
      type: "task.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }
}
