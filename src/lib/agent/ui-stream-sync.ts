import type { LanguageModelUsage, UIMessage } from "ai";

import { getModelContextWindow } from "@/lib/agent-models";
import { estimateLanguageModelUsageCostUsd } from "@/lib/agent/mode-usage";
import type { BudgetTracker } from "@/lib/session/control/budget";
import type { RuntimeEventPayload, UIMessagePartSnapshot } from "@/lib/session/events";

export type MessageSyncState = {
  messageId: string;
  /** Cheap dirty keys — text/reasoning avoid full JSON.stringify on every token. */
  partSnapshots: string[];
};

/**
 * Fingerprint a part for change detection.
 * Hot path (text / reasoning): concatenate fields. Cold path (tools, etc.): JSON.
 */
export function partDirtyKey(part: UIMessagePartSnapshot): string {
  switch (part.type) {
    case "text":
      return `t\0${part.state ?? ""}\0${part.text}`;
    case "reasoning":
      return `r\0${part.state ?? ""}\0${typeof part.text === "string" ? part.text : ""}`;
    case "file":
      return `f\0${part.url}\0${part.filename ?? ""}\0${part.mediaType}`;
    case "source-url":
      return `su\0${part.sourceId}\0${part.url}\0${part.title ?? ""}`;
    case "source-document":
      return `sd\0${part.sourceId}\0${part.title}\0${part.mediaType}\0${part.filename ?? ""}`;
    case "step-start":
      return "ss";
    default:
      return JSON.stringify(part);
  }
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

  const prevSnapshots = currentState.partSnapshots;
  let nextSnapshots = prevSnapshots;
  let cloned = false;

  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];
    if (!part) continue;

    const key = partDirtyKey(part);
    if (prevSnapshots[index] === key) {
      continue;
    }

    emit({
      type: "assistant.part_updated",
      messageId: message.id,
      partIndex: index,
      part,
    });

    if (!cloned) {
      nextSnapshots = prevSnapshots.slice();
      cloned = true;
    }
    nextSnapshots[index] = key;
  }

  if (!cloned) {
    return currentState;
  }

  return { messageId: message.id, partSnapshots: nextSnapshots };
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
