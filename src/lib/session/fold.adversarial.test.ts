import { describe, expect, test } from "bun:test";

import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  isRuntimeEvent,
  type RuntimeEvent,
  type RuntimeEventPayload,
} from "./events";
import { isKnownRuntimeEvent, projectMandate, reduceFold, createFoldState } from "./fold";

const TASK_ID = "task-adversarial";

function evt(seq: number, payload: RuntimeEventPayload): RuntimeEvent {
  return {
    ...payload,
    eventId: `${TASK_ID}-${seq}`,
    taskId: TASK_ID,
    timestamp: 1_000 + seq,
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
  };
}

describe("fold adversarial / invariants", () => {
  test("duplicate eventId is a no-op (idempotent replay)", () => {
    const started = evt(1, {
      type: "task.started",
      prompt: "hi",
      modelId: "openai/gpt-5.4",
      agentMode: "live",
    });
    let state = createFoldState();
    state = reduceFold(state, started);
    const afterFirst = state;
    state = reduceFold(state, started);
    expect(state).toBe(afterFirst);
    expect(state.rows).toBe(afterFirst.rows);
  });

  test("isKnownRuntimeEvent covers live payload types and rejects junk", () => {
    expect(isKnownRuntimeEvent({ type: "task.started" })).toBe(true);
    expect(isKnownRuntimeEvent({ type: "assistant.part_updated" })).toBe(true);
    expect(isKnownRuntimeEvent({ type: "budget.exceeded" })).toBe(true);
    expect(isKnownRuntimeEvent({ type: "not.a.real.event" })).toBe(false);
  });

  test("interaction events never mutate transcript rows", () => {
    const projection = projectMandate([
      evt(1, {
        type: "task.started",
        prompt: "hi",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
      }),
      evt(2, {
        type: "interaction.requested",
        callId: "c1",
        kind: "permission",
        permission: { capability: "delete_path", input: {}, risk: "high" },
      }),
      evt(3, {
        type: "interaction.resolved",
        callId: "c1",
        kind: "permission",
        permission: { decision: "allowed" },
      }),
    ]);

    expect(projection.rows.every((row) => row.type === "message")).toBe(true);
    expect(projection.pendingInteractions).toEqual([]);
  });

  test("omitUserMessage on retry does not append a user row", () => {
    const projection = projectMandate([
      evt(1, {
        type: "task.started",
        prompt: "retry",
        modelId: "openai/gpt-5.4",
        agentMode: "live",
        omitUserMessage: true,
      }),
    ]);
    expect(projection.rows).toEqual([]);
    expect(projection.status).toBe("running");
  });
});

describe("isRuntimeEvent", () => {
  test("accepts envelope-shaped events", () => {
    expect(
      isRuntimeEvent({
        type: "task.completed",
        finishReason: "stop",
        eventId: "e1",
        taskId: "t1",
        schemaVersion: 1,
        timestamp: 1,
      }),
    ).toBe(true);
  });

  test("rejects incomplete envelopes", () => {
    expect(isRuntimeEvent(null)).toBe(false);
    expect(isRuntimeEvent({ type: "task.completed" })).toBe(false);
    expect(isRuntimeEvent({ type: "task.completed", eventId: "e", taskId: "t" })).toBe(false);
  });
});
