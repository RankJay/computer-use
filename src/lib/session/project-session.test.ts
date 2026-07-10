import { describe, expect, test } from "bun:test";

import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  type RuntimeEvent,
  type RuntimeEventPayload,
} from "./events";
import { createFoldState, projectSession, reduceSession, toProjection } from "./project-session";

const TASK_ID = "task-1";

function evt(seq: number, payload: RuntimeEventPayload): RuntimeEvent {
  return {
    ...payload,
    eventId: `${TASK_ID}-${seq}`,
    taskId: TASK_ID,
    timestamp: 1_000 + seq,
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
  };
}

describe("project-session", () => {
  test("task.completed with cancelled finishReason sets status cancelled", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
      evt(2, { type: "task.status_changed", status: "cancelled" }),
      evt(3, { type: "task.completed", finishReason: "cancelled" }),
    ]);

    expect(projection.status).toBe("cancelled");
  });

  test("task.completed with budget finishReason sets status failed", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, { type: "task.completed", finishReason: "budget" }),
    ]);

    expect(projection.status).toBe("failed");
  });

  test("task.failed stores recoverable on failure", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "task.failed",
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

  test("pendingPermissions supports parallel callIds", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "permission.requested",
        callId: "call-a",
        capability: "run_shell",
        input: { command: "ls" },
        risk: "high",
      }),
      evt(3, {
        type: "permission.requested",
        callId: "call-b",
        capability: "write_file",
        input: { path: "a.ts" },
        risk: "medium",
      }),
    ]);

    expect(projection.status).toBe("waiting_permission");
    expect(projection.pendingPermissions).toHaveLength(2);
    expect(projection.pendingPermissions.map((p) => p.callId)).toEqual(["call-a", "call-b"]);
  });

  test("permission.resolved removes only that callId", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "permission.requested",
        callId: "call-a",
        capability: "run_shell",
        input: {},
        risk: "high",
      }),
      evt(3, {
        type: "permission.requested",
        callId: "call-b",
        capability: "write_file",
        input: {},
        risk: "medium",
      }),
      evt(4, {
        type: "permission.resolved",
        callId: "call-a",
        decision: "approved",
      }),
    ]);

    expect(projection.pendingPermissions).toHaveLength(1);
    expect(projection.pendingPermissions[0]?.callId).toBe("call-b");
    expect(projection.status).toBe("waiting_permission");
  });

  test("resolving last permission returns status to running", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "permission.requested",
        callId: "call-a",
        capability: "run_shell",
        input: {},
        risk: "high",
      }),
      evt(3, {
        type: "permission.resolved",
        callId: "call-a",
        decision: "denied",
      }),
    ]);

    expect(projection.pendingPermissions).toEqual([]);
    expect(projection.status).toBe("running");
  });

  test("permission events do not invent dynamic-tool parts", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
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
        type: "permission.requested",
        callId: "call-a",
        capability: "run_shell",
        input: { command: "ls" },
        risk: "high",
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
      type: "task.started",
      prompt: "hi",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    let state = createFoldState();
    state = reduceSession(state, event);
    const afterFirst = toProjection(state);
    state = reduceSession(state, event);
    const afterDup = toProjection(state);

    expect(afterDup.rows).toHaveLength(afterFirst.rows.length);
    expect(afterDup.chatMessages).toEqual(afterFirst.chatMessages);
  });

  test("structural sharing preserves untouched row references", () => {
    let state = createFoldState();
    state = reduceSession(
      state,
      evt(1, {
        type: "activity.marker",
        markerId: "m1",
        text: "Today",
        variant: "separator",
      }),
    );
    const markerRef = state.rows[0];
    state = reduceSession(
      state,
      evt(2, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "demo",
      }),
    );
    expect(state.rows[0]).toBe(markerRef);
  });

  test("activity and assistant events build transcript rows", () => {
    const projection = projectSession([
      evt(1, {
        type: "activity.marker",
        markerId: "m1",
        text: "Today",
        variant: "separator",
      }),
      evt(2, {
        type: "task.started",
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
      evt(6, { type: "task.completed", finishReason: "stop" }),
    ]);

    expect(projection.status).toBe("completed");
    expect(projection.rows.map((r) => r.type)).toEqual(["marker", "message", "message"]);
    expect(projection.chatMessages).toHaveLength(2);
    expect(projection.streamingMessageId).toBeNull();
  });

  test("budget.exceeded is recoverable failure", () => {
    const projection = projectSession([
      evt(1, {
        type: "task.started",
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
});
