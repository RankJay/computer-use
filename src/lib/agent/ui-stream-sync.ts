import type { LanguageModelUsage, UIMessage } from "ai";

import { getModelContextWindow } from "@/lib/agent-models";
import { estimateLanguageModelUsageCostUsd } from "@/lib/agent/model-usage";
import type { BudgetTracker } from "@/lib/session/control/budget";
import type { RuntimeEventPayload, UIMessagePartSnapshot } from "@/lib/session/events";

export type MessageSyncState = {
  messageId: string;
  partSnapshots: string[];
};

function serializePart(part: UIMessagePartSnapshot): string {
  return JSON.stringify(part);
}

export function syncAssistantMessage(
  emit: (payload: RuntimeEventPayload) => void,
  message: UIMessage,
  state: MessageSyncState | null,
): MessageSyncState {
  let currentState = state;

  if (currentState && currentState.messageId !== message.id) {
    emit({ type: "assistant.message_finished", messageId: currentState.messageId });
    currentState = null;
  }

  if (!currentState) {
    emit({
      type: "assistant.message_started",
      messageId: message.id,
      role: "assistant",
    });
    currentState = { messageId: message.id, partSnapshots: [] };
  }

  const partSnapshots = [...currentState.partSnapshots];
  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];
    if (!part) continue;

    const snapshot = serializePart(part);
    if (partSnapshots[index] !== snapshot) {
      emit({
        type: "assistant.part_updated",
        messageId: message.id,
        partIndex: index,
        part,
      });
      partSnapshots[index] = snapshot;
    }
  }

  return { messageId: message.id, partSnapshots };
}

export function finishAssistantMessage(
  emit: (payload: RuntimeEventPayload) => void,
  state: MessageSyncState | null,
): void {
  if (!state) return;
  emit({ type: "assistant.message_finished", messageId: state.messageId });
}

export function emitUsageAndBudget(
  emit: (payload: RuntimeEventPayload) => void,
  modelId: string,
  budget: BudgetTracker,
  usage: LanguageModelUsage,
): void {
  const maxTokens = getModelContextWindow(modelId);
  const usedTokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);

  emit({
    type: "usage.updated",
    modelId,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      inputTokenDetails: usage.inputTokenDetails,
      outputTokenDetails: usage.outputTokenDetails,
    },
    usedTokens,
    maxTokens,
  });

  budget.addCostUsd(estimateLanguageModelUsageCostUsd(modelId, usage).totalUsd);

  const snapshot = budget.snapshot();
  emit({
    type: "budget.updated",
    stepsUsed: snapshot.stepsUsed,
    maxSteps: snapshot.maxSteps,
    costUsd: snapshot.costUsd,
    maxCostUsd: snapshot.maxCostUsd,
    elapsedMs: snapshot.elapsedMs,
    maxWallClockMs: snapshot.maxWallClockMs,
  });
}
