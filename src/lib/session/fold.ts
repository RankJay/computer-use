import type { UIMessage } from "ai";

import type { RuntimeEvent, UIMessagePartSnapshot } from "./events";
import {
  createEmptyMandateProjection,
  EMPTY_PENDING_INTERACTIONS,
  type PendingInteraction,
  type MandateProjection,
} from "./projection";
import type { AgentMessageRowData, AgentTranscriptRow } from "./rows";

/** Clear pending interactions without inventing a new empty-array identity. */
function clearedPendingInteractions(pending: PendingInteraction[]): PendingInteraction[] {
  return pending.length === 0 ? pending : EMPTY_PENDING_INTERACTIONS;
}

export type FoldState = {
  attemptId: string | null;
  status: MandateProjection["status"];
  failure: MandateProjection["failure"];
  rows: AgentTranscriptRow[];
  pendingInteractions: PendingInteraction[];
  usage: MandateProjection["usage"];
  budget: MandateProjection["budget"];
  streamingMessageId: string | null;
  seenEventIds: ReadonlySet<string>;
};

export function createFoldState(
  previous: MandateProjection = createEmptyMandateProjection(),
  seenEventIds: ReadonlySet<string> = new Set(),
): FoldState {
  return {
    attemptId: previous.attemptId,
    status: previous.status,
    failure: previous.failure,
    rows: previous.rows,
    pendingInteractions: previous.pendingInteractions,
    usage: { ...previous.usage },
    budget: { ...previous.budget },
    streamingMessageId: previous.streamingMessageId,
    seenEventIds,
  };
}

/** Seed fold state from persisted messages — bypasses the RuntimeEvent log. */
export function foldStateFromMessages(messages: readonly UIMessage[]): FoldState {
  const rows: AgentMessageRowData[] = messages.map((message) => ({
    type: "message",
    id: message.id,
    message,
  }));
  return createFoldState({ ...createEmptyMandateProjection(), rows, chatMessages: [...messages] });
}

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
  state: FoldState,
  messageId: string,
): { state: FoldState; row: AgentMessageRowData } {
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
    },
    row,
  };
}

function setMessagePart(
  state: FoldState,
  messageId: string,
  partIndex: number,
  part: UIMessagePartSnapshot,
): FoldState {
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
  };
}

function appendFailureMessage(state: FoldState, attemptId: string, message: string): FoldState {
  const errorMessageId = `error-${attemptId}`;
  const errorMessage: UIMessage = {
    id: errorMessageId,
    role: "assistant",
    parts: [{ type: "text", text: `Error: ${message}` }],
  };
  const row: AgentMessageRowData = {
    type: "message",
    id: errorMessageId,
    message: errorMessage,
  };
  return {
    ...state,
    rows: upsertRow(state.rows, row),
  };
}

function chatMessagesFromRows(rows: readonly AgentTranscriptRow[]): UIMessage[] {
  return rows
    .filter((row): row is AgentMessageRowData => row.type === "message")
    .map((row) => row.message);
}

function withSeen(state: FoldState, eventId: string): FoldState {
  const seenEventIds = new Set(state.seenEventIds);
  seenEventIds.add(eventId);
  return { ...state, seenEventIds };
}

function formatBudgetExceededMessage(dimension: "steps" | "cost" | "wall_clock"): string {
  switch (dimension) {
    case "steps":
      return "Run stopped: step limit reached";
    case "cost":
      return "Run stopped: cost limit reached";
    case "wall_clock":
      return "Run stopped: time limit reached";
    default: {
      const _exhaustive: never = dimension;
      return _exhaustive;
    }
  }
}

const KNOWN_EVENT_TYPES = new Set<RuntimeEvent["type"]>([
  "attempt.started",
  "attempt.status_changed",
  "attempt.completed",
  "attempt.failed",
  "assistant.message_started",
  "assistant.part_updated",
  "assistant.message_finished",
  "capability.requested",
  "capability.completed",
  "capability.failed",
  "interaction.requested",
  "interaction.resolved",
  "usage.updated",
  "budget.updated",
  "budget.exceeded",
  "entitlement.denied",
  "entitlement.metered",
  "activity.marker",
  "activity.chain_updated",
  "activity.task_updated",
]);

export function isKnownRuntimeEvent(event: { type: string }): boolean {
  return KNOWN_EVENT_TYPES.has(event.type as RuntimeEvent["type"]);
}

/**
 * Pure immutable reducer with structural sharing.
 * Interaction events update pendingInteractions only — they never patch tool parts.
 */
export function reduceFold(state: FoldState, event: RuntimeEvent): FoldState {
  if (state.seenEventIds.has(event.eventId)) {
    return state;
  }

  const base = withSeen(state, event.eventId);

  switch (event.type) {
    case "attempt.started": {
      const next: FoldState = {
        ...base,
        attemptId: event.attemptId,
        status: "running",
        failure: null,
        pendingInteractions: clearedPendingInteractions(base.pendingInteractions),
        streamingMessageId: null,
        usage: { ...base.usage, modelId: event.modelId },
      };
      if (event.omitUserMessage) {
        return next;
      }
      const userMessageId = event.userMessageId ?? `user-${event.attemptId}`;
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
        ...next,
        rows: upsertRow(base.rows, row),
      };
    }

    case "attempt.status_changed":
      return { ...base, status: event.status };

    case "attempt.completed": {
      let status: MandateProjection["status"] = base.status;
      if (event.finishReason === "cancelled") {
        status = "cancelled";
      } else if (event.finishReason === "budget" || event.finishReason === "error") {
        status = "failed";
      } else if (base.status !== "failed") {
        status = "completed";
      }
      return {
        ...base,
        status,
        pendingInteractions: clearedPendingInteractions(base.pendingInteractions),
        streamingMessageId: null,
      };
    }

    case "attempt.failed": {
      const withFailure: FoldState = {
        ...base,
        status: "failed",
        failure: {
          code: event.code,
          message: event.message,
          recoverable: event.recoverable,
        },
        pendingInteractions: clearedPendingInteractions(base.pendingInteractions),
        streamingMessageId: null,
      };
      return appendFailureMessage(withFailure, event.attemptId, event.message);
    }

    case "assistant.message_started":
      return ensureAssistantMessage(base, event.messageId).state;

    case "assistant.part_updated":
      return setMessagePart(base, event.messageId, event.partIndex, event.part);

    case "assistant.message_finished":
      return {
        ...base,
        streamingMessageId:
          base.streamingMessageId === event.messageId ? null : base.streamingMessageId,
      };

    case "activity.marker": {
      const row: AgentTranscriptRow = {
        type: "marker",
        id: event.markerId,
        variant: event.variant,
        text: event.text,
        live: event.live,
        status: event.status,
      };
      return { ...base, rows: upsertRow(base.rows, row) };
    }

    case "activity.chain_updated": {
      const row: AgentTranscriptRow = {
        type: "chain-of-thought",
        id: event.chainId,
        steps: event.steps,
      };
      return { ...base, rows: upsertRow(base.rows, row) };
    }

    case "activity.task_updated": {
      const row: AgentTranscriptRow = {
        type: "task",
        id: event.activityTaskId,
        title: event.title,
        items: event.items,
      };
      return { ...base, rows: upsertRow(base.rows, row) };
    }

    case "interaction.requested": {
      const next: PendingInteraction = {
        callId: event.callId,
        kind: event.kind,
        permission: event.permission,
      };
      const withoutDup = base.pendingInteractions.filter((p) => p.callId !== event.callId);
      return {
        ...base,
        status: "waiting_interaction",
        pendingInteractions: [...withoutDup, next],
      };
    }

    case "interaction.resolved": {
      const remaining = base.pendingInteractions.filter((p) => p.callId !== event.callId);
      const pendingInteractions = remaining.length === 0 ? EMPTY_PENDING_INTERACTIONS : remaining;
      return {
        ...base,
        pendingInteractions,
        status:
          pendingInteractions.length > 0
            ? "waiting_interaction"
            : base.status === "waiting_interaction"
              ? "running"
              : base.status,
      };
    }

    case "usage.updated":
      return {
        ...base,
        usage: {
          modelId: event.modelId,
          usage: event.usage ?? null,
          usedTokens: event.usedTokens,
          maxTokens: event.maxTokens,
        },
      };

    case "budget.updated":
      return {
        ...base,
        budget: {
          stepsUsed: event.stepsUsed,
          maxSteps: event.maxSteps,
          costUsd: event.costUsd,
          maxCostUsd: event.maxCostUsd,
          elapsedMs: event.elapsedMs,
          maxWallClockMs: event.maxWallClockMs,
        },
      };

    case "budget.exceeded": {
      const message = formatBudgetExceededMessage(event.dimension);
      let next: FoldState = {
        ...base,
        status: "failed",
        failure: {
          code: "budget_exceeded",
          message,
          recoverable: true,
        },
        pendingInteractions: clearedPendingInteractions(base.pendingInteractions),
        streamingMessageId: null,
      };
      if (base.attemptId) {
        next = appendFailureMessage(next, base.attemptId, message);
      }
      return next;
    }

    case "capability.requested":
    case "capability.completed":
    case "capability.failed":
    case "entitlement.denied":
    case "entitlement.metered":
      return base;

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Emit Projection with structural sharing.
 * Pass `previous` from the engine so unchanged slices keep identity across events
 * (usage/budget stay silent on part_updated; chatMessages rebuild only when rows change).
 */
export function toProjection(
  state: FoldState,
  previous: MandateProjection | null = null,
): MandateProjection {
  const rowsUnchanged = previous !== null && Object.is(previous.rows, state.rows);
  return {
    attemptId: state.attemptId,
    status: state.status,
    failure: state.failure,
    rows: state.rows,
    chatMessages: rowsUnchanged ? previous.chatMessages : chatMessagesFromRows(state.rows),
    pendingInteractions: state.pendingInteractions,
    usage: state.usage,
    budget: state.budget,
    streamingMessageId: state.streamingMessageId,
  };
}

/** Batch fold for tests and replay. Rebuilds internal seenEventIds from scratch. */
export function projectMandate(events: readonly RuntimeEvent[]): MandateProjection {
  let state = createFoldState();
  for (const event of events) {
    state = reduceFold(state, event);
  }
  return toProjection(state);
}
