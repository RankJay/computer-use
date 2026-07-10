import {
  isDynamicToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";

import type { RunStatus } from "../events";
import type { SessionProjection } from "../projection";
import type { AgentMessageRowData, AgentTranscriptRow } from "../rows";

function isActiveStatus(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

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

/**
 * Presentation-plane row list for AgentTranscript.
 * Never mutates SessionProjection — live may insert a synthetic Thinking… marker.
 */
export function deriveDisplayRows(projection: SessionProjection): readonly AgentTranscriptRow[] {
  const { rows, status, taskId, streamingMessageId } = projection;

  if (hasAuthoredActivityRows(rows)) {
    return rows;
  }

  if (!isActiveStatus(status) || !taskId) {
    return rows;
  }

  const assistantRow =
    getMessageRow(rows, streamingMessageId) ??
    rows.find(
      (row): row is AgentMessageRowData =>
        row.type === "message" &&
        row.message.role === "assistant" &&
        row.id === `assistant-${taskId}`,
    );

  const parts = assistantRow?.message.parts ?? [];
  if (hasVisibleReasoning(parts) || hasVisibleAssistantOutput(parts)) {
    return rows;
  }

  const marker: AgentTranscriptRow = {
    type: "marker",
    id: `live-thinking-${taskId}`,
    text: "Thinking…",
    live: true,
    status: true,
  };

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
