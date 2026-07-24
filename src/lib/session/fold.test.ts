import { describe, expect, test } from "bun:test";

import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  type RuntimeEvent,
  type RuntimeEventPayload,
} from "./events";
import {
  createFoldState,
  foldStateFromMessages,
  projectMandate,
  reduceFold,
  toProjection,
} from "./fold";

const TASK_ID = "task-1";

function evt(seq: number, payload: RuntimeEventPayload): RuntimeEvent {
  return {
    ...payload,
    eventId: `${TASK_ID}-${seq}`,
    attemptId: TASK_ID,
    timestamp: 1_000 + seq,
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
  };
}

describe("fold", () => {
  test("attempt.completed with cancelled finishReason sets status cancelled", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
      evt(2, { type: "attempt.status_changed", status: "cancelled" }),
      evt(3, { type: "attempt.completed", finishReason: "cancelled" }),
    ]);

    expect(projection.status).toBe("cancelled");
  });

  test("attempt.completed with budget finishReason sets status failed", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, { type: "attempt.completed", finishReason: "budget" }),
    ]);

    expect(projection.status).toBe("failed");
  });

  test("attempt.failed stores recoverable on failure", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "attempt.failed",
        code: "auth",
        message: "missing key",
        recoverable: true,
      }),
    ]);

    expect(projection.status).toBe("failed");
    expect(projection.failure).toEqual({
      code: "auth",
      message: "missing key",
      recoverable: true,
    });
  });

  test("pendingInteractions supports parallel callIds", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "interaction.requested",
        callId: "call-a",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: { command: "ls" },
          risk: "high",
        },
      }),
      evt(3, {
        type: "interaction.requested",
        callId: "call-b",
        kind: "permission",
        permission: {
          capability: "write_file",
          input: { path: "a.ts" },
          risk: "medium",
        },
      }),
    ]);

    expect(projection.status).toBe("waiting_interaction");
    expect(projection.pendingInteractions).toHaveLength(2);
    expect(projection.pendingInteractions.map((p) => p.callId)).toEqual(["call-a", "call-b"]);
  });

  test("interaction.resolved removes only that callId", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "interaction.requested",
        callId: "call-a",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: {},
          risk: "high",
        },
      }),
      evt(3, {
        type: "interaction.requested",
        callId: "call-b",
        kind: "permission",
        permission: {
          capability: "write_file",
          input: {},
          risk: "medium",
        },
      }),
      evt(4, {
        type: "interaction.resolved",
        callId: "call-a",
        kind: "permission",
        permission: {
          decision: "approved",
        },
      }),
    ]);

    expect(projection.pendingInteractions).toHaveLength(1);
    expect(projection.pendingInteractions[0]?.callId).toBe("call-b");
    expect(projection.status).toBe("waiting_interaction");
  });

  test("resolving last permission returns status to running", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "interaction.requested",
        callId: "call-a",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: {},
          risk: "high",
        },
      }),
      evt(3, {
        type: "interaction.resolved",
        callId: "call-a",
        kind: "permission",
        permission: {
          decision: "denied",
        },
      }),
    ]);

    expect(projection.pendingInteractions).toEqual([]);
    expect(projection.status).toBe("running");
  });

  test("permission events do not invent dynamic-tool parts", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "assistant.message_started",
        messageId: "asst-1",
        role: "assistant",
      }),
      evt(3, {
        type: "interaction.requested",
        callId: "call-a",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: { command: "ls" },
          risk: "high",
        },
      }),
    ]);

    const assistant = projection.rows.find((r) => r.id === "asst-1");
    expect(assistant?.type).toBe("message");
    if (assistant?.type === "message") {
      expect(assistant.message.parts).toEqual([]);
    }
  });

  test("duplicate eventId is a no-op", () => {
    const event = evt(1, {
      type: "attempt.started",
      prompt: "hi",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    let state = createFoldState();
    state = reduceFold(state, event);
    const afterFirst = toProjection(state);
    state = reduceFold(state, event);
    const afterDup = toProjection(state);

    expect(afterDup.rows).toHaveLength(afterFirst.rows.length);
    expect(afterDup.chatMessages).toEqual(afterFirst.chatMessages);
  });

  test("structural sharing preserves untouched row references", () => {
    let state = createFoldState();
    state = reduceFold(
      state,
      evt(1, {
        type: "activity.marker",
        markerId: "m1",
        text: "Today",
        variant: "separator",
      }),
    );
    const markerRef = state.rows[0];
    state = reduceFold(
      state,
      evt(2, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
    );
    expect(state.rows[0]).toBe(markerRef);
  });

  test("clearing pendingInteractions reuses empty-array identity", () => {
    let state = createFoldState();
    const emptyRef = state.pendingInteractions;

    state = reduceFold(
      state,
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
    );
    expect(state.pendingInteractions).toBe(emptyRef);

    state = reduceFold(
      state,
      evt(2, {
        type: "attempt.completed",
        finishReason: "stop",
      }),
    );
    expect(state.pendingInteractions).toBe(emptyRef);

    const before = toProjection(state);
    state = reduceFold(
      state,
      evt(3, {
        type: "attempt.started",
        prompt: "again",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
    );
    const after = toProjection(state, before);
    expect(after.pendingInteractions).toBe(before.pendingInteractions);
  });

  test("toProjection reuses usage/budget/chatMessages when unchanged", () => {
    let state = createFoldState();
    state = reduceFold(
      state,
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
    );
    state = reduceFold(
      state,
      evt(2, {
        type: "assistant.message_started",
        messageId: "asst-1",
        role: "assistant",
      }),
    );
    const before = toProjection(state);

    state = reduceFold(
      state,
      evt(3, {
        type: "assistant.part_updated",
        messageId: "asst-1",
        partIndex: 0,
        part: { type: "text", text: "hello" },
      }),
    );
    const afterPart = toProjection(state, before);

    expect(afterPart.usage).toBe(before.usage);
    expect(afterPart.budget).toBe(before.budget);
    expect(afterPart.chatMessages).not.toBe(before.chatMessages);

    state = reduceFold(
      state,
      evt(4, {
        type: "usage.updated",
        modelId: "openai/gpt-5.4",
        usedTokens: 12,
        maxTokens: 200_000,
      }),
    );
    const afterUsage = toProjection(state, afterPart);

    expect(afterUsage.usage).not.toBe(afterPart.usage);
    expect(afterUsage.budget).toBe(afterPart.budget);
    expect(afterUsage.rows).toBe(afterPart.rows);
    expect(afterUsage.chatMessages).toBe(afterPart.chatMessages);
  });

  test("activity and assistant events build transcript rows", () => {
    const projection = projectMandate([
      evt(1, {
        type: "activity.marker",
        markerId: "m1",
        text: "Today",
        variant: "separator",
      }),
      evt(2, {
        type: "attempt.started",
        prompt: "Build it",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
        userMessageId: "user-1",
      }),
      evt(3, {
        type: "assistant.message_started",
        messageId: "asst-1",
        role: "assistant",
      }),
      evt(4, {
        type: "assistant.part_updated",
        messageId: "asst-1",
        partIndex: 0,
        part: { type: "text", text: "Done." },
      }),
      evt(5, { type: "assistant.message_finished", messageId: "asst-1" }),
      evt(6, { type: "attempt.completed", finishReason: "stop" }),
    ]);

    expect(projection.status).toBe("completed");
    expect(projection.rows.map((r) => r.type)).toEqual(["marker", "message", "message"]);
    expect(projection.chatMessages).toHaveLength(2);
    expect(projection.streamingMessageId).toBeNull();
  });

  test("budget.exceeded is recoverable failure", () => {
    const projection = projectMandate([
      evt(1, {
        type: "attempt.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, { type: "budget.exceeded", dimension: "steps" }),
    ]);

    expect(projection.status).toBe("failed");
    expect(projection.failure?.recoverable).toBe(true);
    expect(projection.failure?.code).toBe("budget_exceeded");
  });

  test("foldStateFromMessages seeds rows and chatMessages without events", () => {
    const messages = [
      {
        id: "u1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hello" }],
      },
      {
        id: "a1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "hi" }],
      },
    ];

    const fold = foldStateFromMessages(messages);
    const projection = toProjection(fold);

    expect(fold.status).toBe("idle");
    expect(fold.seenEventIds.size).toBe(0);
    expect(projection.rows).toEqual([
      { type: "message", id: "u1", message: messages[0] },
      { type: "message", id: "a1", message: messages[1] },
    ]);
    expect(projection.chatMessages).toEqual(messages);
  });
});
