import type { UIMessage } from "ai";

import type {
  AgentMessageRowData,
  AgentTranscriptRow,
  DemoRuntimeEvent,
  TranscriptState,
  UIMessagePartSnapshot,
} from "./types";
import { createEmptyTranscriptState } from "./types";

function findRowIndex(rows: readonly AgentTranscriptRow[], id: string): number {
  return rows.findIndex((row) => row.id === id);
}

function upsertRow(rows: AgentTranscriptRow[], row: AgentTranscriptRow): AgentTranscriptRow[] {
  const index = findRowIndex(rows, row.id);
  if (index === -1) {
    return [...rows, row];
  }
  if (Object.is(rows[index], row)) {
    return rows;
  }
  const next = rows.slice();
  next[index] = row;
  return next;
}

function getMessageRow(
  rows: readonly AgentTranscriptRow[],
  messageId: string,
): AgentMessageRowData | undefined {
  const row = rows.find((candidate) => candidate.id === messageId);
  return row?.type === "message" ? row : undefined;
}

function ensureAssistantMessage(
  state: TranscriptState,
  messageId: string,
): { state: TranscriptState; row: AgentMessageRowData } {
  const existing = getMessageRow(state.rows, messageId);
  if (existing) {
    return { state, row: existing };
  }

  const message: UIMessage = {
    id: messageId,
    role: "assistant",
    parts: [],
  };
  const row: AgentMessageRowData = {
    type: "message",
    id: messageId,
    message,
  };
  return {
    state: {
      ...state,
      rows: upsertRow(state.rows, row),
      streamingMessageId: messageId,
      status: "streaming",
    },
    row,
  };
}

function setMessagePart(
  state: TranscriptState,
  messageId: string,
  partIndex: number,
  part: UIMessagePartSnapshot,
): TranscriptState {
  const ensured = ensureAssistantMessage(state, messageId);
  const { row } = ensured;
  const working = ensured.state;

  const parts = row.message.parts.slice();
  while (parts.length <= partIndex) {
    parts.push({ type: "text", text: "" });
  }
  parts[partIndex] = part;

  const nextRow: AgentMessageRowData = {
    ...row,
    message: {
      ...row.message,
      parts,
    },
  };

  return {
    ...working,
    rows: upsertRow(working.rows, nextRow),
    streamingMessageId: messageId,
    status: "streaming",
  };
}

/**
 * Pure reducer with structural sharing: untouched row object references are preserved.
 */
export function applyDemoEvent(state: TranscriptState, event: DemoRuntimeEvent): TranscriptState {
  switch (event.type) {
    case "activity.marker": {
      const row: AgentTranscriptRow = {
        type: "marker",
        id: event.markerId,
        variant: event.variant,
        text: event.text,
        live: event.live,
        status: event.status,
      };
      return { ...state, rows: upsertRow(state.rows, row) };
    }

    case "task.started": {
      const userMessageId = event.userMessageId ?? "msg-user-1";
      const userMessage: UIMessage = {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text: event.prompt }],
      };
      const row: AgentMessageRowData = {
        type: "message",
        id: userMessageId,
        message: userMessage,
        scrollAnchor: true,
      };
      return {
        ...state,
        status: "streaming",
        streamingMessageId: null,
        rows: upsertRow(state.rows, row),
      };
    }

    case "task.status_changed": {
      if (event.status === "streaming" || event.status === "running") {
        return { ...state, status: "streaming" };
      }
      if (event.status === "completed") {
        return { ...state, status: "completed", streamingMessageId: null };
      }
      if (event.status === "cancelled") {
        return { ...state, status: "cancelled", streamingMessageId: null };
      }
      return state;
    }

    case "task.completed":
      return {
        ...state,
        status: "completed",
        streamingMessageId: null,
      };

    case "assistant.message_started":
      return ensureAssistantMessage(state, event.messageId).state;

    case "assistant.part_updated":
      return setMessagePart(state, event.messageId, event.partIndex, event.part);

    case "assistant.message_finished":
      return {
        ...state,
        streamingMessageId:
          state.streamingMessageId === event.messageId ? null : state.streamingMessageId,
      };

    case "activity.chain_updated": {
      const row: AgentTranscriptRow = {
        type: "chain-of-thought",
        id: event.chainId,
        steps: event.steps,
      };
      return { ...state, rows: upsertRow(state.rows, row) };
    }

    case "activity.task_updated": {
      const row: AgentTranscriptRow = {
        type: "task",
        id: event.activityTaskId,
        title: event.title,
        items: event.items,
      };
      return { ...state, rows: upsertRow(state.rows, row) };
    }

    case "usage.updated":
      return state;

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function applyDemoEvents(
  events: readonly DemoRuntimeEvent[],
  initial: TranscriptState = createEmptyTranscriptState(),
): TranscriptState {
  return events.reduce(applyDemoEvent, initial);
}
