import {
  isDynamicToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";

import type { RunStatus } from "../events";
import type { AgentMessageRowData, AgentTranscriptRow } from "../rows";
import { isLiveRun } from "../run-status";

export type DisplayRowsInput = {
  readonly rows: readonly AgentTranscriptRow[];
  readonly status: RunStatus;
  readonly attemptId: string | null;
  readonly streamingMessageId: string | null;
};

/** Demo fixtures fold activity.* into CoT / task / marker rows — pass those through unchanged. */
function hasAuthoredActivityRows(rows: readonly AgentTranscriptRow[]): boolean {
  return rows.some(
    (row) => row.type === "chain-of-thought" || row.type === "task" || row.type === "marker",
  );
}

function getMessageRow(
  rows: readonly AgentTranscriptRow[],
  messageId: string | null,
): AgentMessageRowData | undefined {
  if (!messageId) return undefined;
  const row = rows.find((candidate) => candidate.id === messageId);
  return row?.type === "message" ? row : undefined;
}

function hasVisibleAssistantOutput(parts: UIMessage["parts"]): boolean {
  for (const part of parts) {
    if (isTextUIPart(part) && part.text.trim().length > 0) {
      return true;
    }
    if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
      return true;
    }
  }
  return false;
}

function hasVisibleReasoning(parts: UIMessage["parts"]): boolean {
  return parts.some((part) => {
    if (!isReasoningUIPart(part)) return false;
    const text = "text" in part && typeof part.text === "string" ? part.text : "";
    return text.trim().length > 0 || part.state === "streaming";
  });
}

function findLastUserRowIndex(rows: readonly AgentTranscriptRow[]): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.type === "message" && row.message.role === "user") {
      return i;
    }
  }
  return -1;
}

const thinkingMarkers = new Map<string, AgentTranscriptRow>();

function thinkingMarkerFor(attemptId: string): AgentTranscriptRow {
  const cached = thinkingMarkers.get(attemptId);
  if (cached) return cached;
  const marker: AgentTranscriptRow = {
    type: "marker",
    id: `live-thinking-${attemptId}`,
    text: "Thinking…",
    live: true,
    status: true,
  };
  thinkingMarkers.set(attemptId, marker);
  return marker;
}

type DeriveCache = {
  rows: readonly AgentTranscriptRow[];
  status: RunStatus;
  attemptId: string | null;
  streamingMessageId: string | null;
  result: readonly AgentTranscriptRow[];
};

let lastDerive: DeriveCache | null = null;

/**
 * Presentation-plane row list for AgentTranscript.
 * Never mutates MandateProjection — live may insert a synthetic Thinking… marker.
 * Result identity is stable when inputs are Object.is-equal.
 */
export function deriveDisplayRows(input: DisplayRowsInput): readonly AgentTranscriptRow[] {
  const { rows, status, attemptId, streamingMessageId } = input;

  if (
    lastDerive &&
    Object.is(lastDerive.rows, rows) &&
    lastDerive.status === status &&
    lastDerive.attemptId === attemptId &&
    lastDerive.streamingMessageId === streamingMessageId
  ) {
    return lastDerive.result;
  }

  const result = computeDisplayRows(rows, status, attemptId, streamingMessageId);
  lastDerive = { rows, status, attemptId, streamingMessageId, result };
  return result;
}

function computeDisplayRows(
  rows: readonly AgentTranscriptRow[],
  status: RunStatus,
  attemptId: string | null,
  streamingMessageId: string | null,
): readonly AgentTranscriptRow[] {
  if (hasAuthoredActivityRows(rows)) {
    return rows;
  }

  if (!isLiveRun(status) || !attemptId) {
    return rows;
  }

  const assistantRow =
    getMessageRow(rows, streamingMessageId) ??
    rows.find(
      (row): row is AgentMessageRowData =>
        row.type === "message" &&
        row.message.role === "assistant" &&
        row.id === `assistant-${attemptId}`,
    );

  const parts = assistantRow?.message.parts ?? [];
  if (hasVisibleReasoning(parts) || hasVisibleAssistantOutput(parts)) {
    return rows;
  }

  const marker = thinkingMarkerFor(attemptId);

  if (assistantRow) {
    const index = rows.findIndex((row) => row.id === assistantRow.id);
    if (index === -1) {
      return [...rows, marker];
    }
    return [...rows.slice(0, index), marker, ...rows.slice(index)];
  }

  const userIndex = findLastUserRowIndex(rows);
  if (userIndex === -1) {
    return [...rows, marker];
  }
  return [...rows.slice(0, userIndex + 1), marker, ...rows.slice(userIndex + 1)];
}
