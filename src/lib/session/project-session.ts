import type { DynamicToolUIPart, UIMessage } from "ai";

import type { AgentMessageRowData, AgentTranscriptRow } from "@/features/ai-chat/types";

import type { RuntimeEvent, UIMessagePartSnapshot } from "./events";
import {
  createEmptySessionProjection,
  deriveControlFlags,
  type SessionProjection,
} from "./projection";

type InternalProjectionState = {
  taskId: string | null;
  status: SessionProjection["status"];
  failure: SessionProjection["failure"];
  rowOrder: string[];
  rowsById: Map<string, AgentTranscriptRow>;
  messages: Map<string, UIMessage>;
  pendingPermission: SessionProjection["pendingPermission"];
  usage: SessionProjection["usage"];
  budget: SessionProjection["budget"];
  seenEventIds: Set<string>;
};

function createInternalState(): InternalProjectionState {
  const empty = createEmptySessionProjection();
  return {
    taskId: empty.taskId,
    status: empty.status,
    failure: empty.failure,
    rowOrder: [],
    rowsById: new Map(),
    messages: new Map(),
    pendingPermission: empty.pendingPermission,
    usage: { ...empty.usage },
    budget: { ...empty.budget },
    seenEventIds: new Set(),
  };
}

function ensureRowOrder(state: InternalProjectionState, rowId: string): void {
  if (!state.rowOrder.includes(rowId)) {
    state.rowOrder.push(rowId);
  }
}

function upsertRow(state: InternalProjectionState, row: AgentTranscriptRow): void {
  state.rowsById.set(row.id, row);
  ensureRowOrder(state, row.id);
}

function syncMessageRow(state: InternalProjectionState, messageId: string): void {
  const message = state.messages.get(messageId);
  if (!message) return;

  const existing = state.rowsById.get(messageId);
  const scrollAnchor = existing?.type === "message" ? existing.scrollAnchor : undefined;

  upsertRow(state, {
    type: "message",
    id: messageId,
    message,
    scrollAnchor,
  });
}

function getOrCreateAssistantMessage(state: InternalProjectionState, messageId: string): UIMessage {
  const existing = state.messages.get(messageId);
  if (existing) return existing;

  const message: UIMessage = {
    id: messageId,
    role: "assistant",
    parts: [],
  };
  state.messages.set(messageId, message);
  syncMessageRow(state, messageId);
  return message;
}

function setMessagePart(
  state: InternalProjectionState,
  messageId: string,
  partIndex: number,
  part: UIMessagePartSnapshot,
): void {
  const message = getOrCreateAssistantMessage(state, messageId);
  const parts = [...message.parts];
  parts[partIndex] = part;
  state.messages.set(messageId, { ...message, parts });
  syncMessageRow(state, messageId);
}

function updateDynamicToolPartByCallId(
  state: InternalProjectionState,
  callId: string,
  update: (part: DynamicToolUIPart) => UIMessagePartSnapshot,
): void {
  for (const [messageId, message] of state.messages) {
    if (message.role !== "assistant") continue;

    for (let index = 0; index < message.parts.length; index += 1) {
      const part = message.parts[index];
      if (part?.type !== "dynamic-tool" || part.toolCallId !== callId) continue;

      setMessagePart(state, messageId, index, update(part));
      return;
    }
  }
}

function appendFailureMessage(state: InternalProjectionState, taskId: string, message: string): void {
  const errorMessageId = `error-${taskId}`;
  const errorMessage: UIMessage = {
    id: errorMessageId,
    role: "assistant",
    parts: [{ type: "text", text: `Error: ${message}` }],
  };
  state.messages.set(errorMessageId, errorMessage);
  upsertRow(state, {
    type: "message",
    id: errorMessageId,
    message: errorMessage,
  });
}

function chatMessagesFromRows(rows: readonly AgentTranscriptRow[]): UIMessage[] {
  return rows
    .filter((row): row is AgentMessageRowData => row.type === "message")
    .map((row) => row.message);
}

function toProjection(state: InternalProjectionState): SessionProjection {
  const control = deriveControlFlags(state.status);
  const rows = state.rowOrder
    .map((id) => state.rowsById.get(id))
    .filter((row): row is AgentTranscriptRow => row !== undefined);

  return {
    taskId: state.taskId,
    status: state.status,
    failure: state.failure,
    rows,
    chatMessages: chatMessagesFromRows(rows),
    pendingPermission: state.pendingPermission,
    usage: { ...state.usage },
    budget: { ...state.budget },
    ...control,
  };
}

export function reduceSession(
  state: InternalProjectionState,
  event: RuntimeEvent,
): InternalProjectionState {
  if (state.seenEventIds.has(event.eventId)) {
    return state;
  }
  state.seenEventIds.add(event.eventId);

  switch (event.type) {
    case "task.started": {
      state.taskId = event.taskId;
      state.status = "running";
      state.failure = null;
      state.pendingPermission = null;
      state.usage.modelId = event.modelId;

      const userMessageId = event.userMessageId ?? `user-${event.taskId}`;
      const userMessage: UIMessage = {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text: event.prompt }],
      };
      state.messages.set(userMessageId, userMessage);
      upsertRow(state, {
        type: "message",
        id: userMessageId,
        message: userMessage,
        scrollAnchor: true,
      });
      break;
    }

    case "task.status_changed":
      state.status = event.status;
      break;

    case "task.completed":
      state.status = "completed";
      state.pendingPermission = null;
      break;

    case "task.failed":
      state.status = "failed";
      state.failure = { code: event.code, message: event.message };
      state.pendingPermission = null;
      appendFailureMessage(state, event.taskId, event.message);
      break;

    case "assistant.message_started":
      getOrCreateAssistantMessage(state, event.messageId);
      break;

    case "assistant.part_updated":
      setMessagePart(state, event.messageId, event.partIndex, event.part);
      break;

    case "assistant.message_finished":
      break;

    case "activity.marker":
      upsertRow(state, {
        type: "marker",
        id: event.markerId,
        variant: event.variant,
        text: event.text,
        live: event.live,
        status: event.status,
      });
      break;

    case "activity.chain_updated":
      upsertRow(state, {
        type: "chain-of-thought",
        id: event.chainId,
        steps: event.steps,
      });
      break;

    case "activity.task_updated":
      upsertRow(state, {
        type: "task",
        id: event.activityTaskId,
        title: event.title,
        items: event.items,
      });
      break;

    case "permission.requested":
      state.status = "waiting_permission";
      state.pendingPermission = {
        callId: event.callId,
        capability: event.capability,
        input: event.input,
        risk: event.risk,
      };
      updateDynamicToolPartByCallId(state, event.callId, (part) => ({
        type: "dynamic-tool",
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: "approval-requested",
        input: event.input,
        approval: { id: event.callId },
      }));
      break;

    case "permission.resolved":
      state.pendingPermission = null;
      if (state.status === "waiting_permission") {
        state.status = "running";
      }
      if (event.decision === "denied") {
        updateDynamicToolPartByCallId(state, event.callId, (part) => ({
          type: "dynamic-tool",
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          state: "output-denied",
          input: part.input,
          approval: { id: event.callId, approved: false },
        }));
      } else {
        updateDynamicToolPartByCallId(state, event.callId, (part) => ({
          type: "dynamic-tool",
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          state: "approval-responded",
          input: part.input,
          approval: { id: event.callId, approved: true },
        }));
      }
      break;

    case "usage.updated":
      state.usage = {
        modelId: event.modelId,
        usage: event.usage,
        usedTokens: event.usedTokens,
        maxTokens: event.maxTokens,
      };
      break;

    case "budget.updated":
      state.budget = {
        stepsUsed: event.stepsUsed,
        maxSteps: event.maxSteps,
        costUsd: event.costUsd,
        maxCostUsd: event.maxCostUsd,
        elapsedMs: event.elapsedMs,
        maxWallClockMs: event.maxWallClockMs,
      };
      break;

    case "budget.exceeded": {
      const message = `Budget exceeded: ${event.dimension}`;
      state.status = "failed";
      state.failure = {
        code: "budget_exceeded",
        message,
      };
      if (state.taskId) {
        appendFailureMessage(state, state.taskId, message);
      }
      break;
    }

    case "capability.requested":
    case "capability.completed":
    case "capability.failed":
      break;

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }

  return state;
}

export function projectSession(events: readonly RuntimeEvent[]): SessionProjection {
  const state = createInternalState();

  for (const event of events) {
    reduceSession(state, event);
  }

  return toProjection(state);
}

export function projectSessionIncremental(
  previous: SessionProjection,
  event: RuntimeEvent,
): SessionProjection {
  const state = createInternalState();
  state.taskId = previous.taskId;
  state.status = previous.status;
  state.failure = previous.failure;
  state.pendingPermission = previous.pendingPermission;
  state.usage = { ...previous.usage };
  state.budget = { ...previous.budget };

  for (const row of previous.rows) {
    upsertRow(state, row);
    if (row.type === "message") {
      state.messages.set(row.id, row.message);
    }
  }

  reduceSession(state, event);
  return toProjection(state);
}
