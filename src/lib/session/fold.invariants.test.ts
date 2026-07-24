import { describe, expect, test } from "bun:test";

import * as fc from "fast-check";

import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  type RuntimeEvent,
  type RuntimeEventPayload,
  type RunStatus,
} from "./events";
import { createFoldState, projectMandate, reduceFold, toProjection, type FoldState } from "./fold";

const TASK_ID = "task-inv";

const RUN_STATUSES: RunStatus[] = [
  "idle",
  "running",
  "streaming",
  "waiting_interaction",
  "completed",
  "failed",
  "cancelled",
];

function withEnvelope(
  eventId: string,
  payload: RuntimeEventPayload,
  timestamp: number,
): RuntimeEvent {
  return {
    ...payload,
    eventId,
    attemptId: TASK_ID,
    timestamp,
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
  };
}

/** Payload arb — ids for interactions/messages stay small so collisions are intentional. */
const payloadArb: fc.Arbitrary<RuntimeEventPayload> = fc.oneof(
  fc.record({
    type: fc.constant("attempt.started" as const),
    prompt: fc.string({ maxLength: 24 }),
    modelId: fc.constantFrom("openai/gpt-4o", "anthropic/claude-sonnet-4"),
    agentMode: fc.constantFrom("live" as const, "demo" as const),
    omitUserMessage: fc.option(fc.boolean(), { nil: undefined }),
  }),
  fc.record({
    type: fc.constant("attempt.status_changed" as const),
    status: fc.constantFrom(...RUN_STATUSES),
  }),
  fc.record({
    type: fc.constant("attempt.completed" as const),
    finishReason: fc.constantFrom(
      "stop" as const,
      "budget" as const,
      "cancelled" as const,
      "error" as const,
    ),
  }),
  fc.record({
    type: fc.constant("attempt.failed" as const),
    code: fc.constantFrom("auth", "provider", "internal"),
    message: fc.string({ maxLength: 32 }),
    recoverable: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("assistant.message_started" as const),
    messageId: fc.constantFrom("asst-1", "asst-2"),
    role: fc.constant("assistant" as const),
  }),
  fc.record({
    type: fc.constant("assistant.part_updated" as const),
    messageId: fc.constantFrom("asst-1", "asst-2"),
    partIndex: fc.integer({ min: 0, max: 3 }),
    part: fc.record({
      type: fc.constant("text" as const),
      text: fc.string({ maxLength: 16 }),
    }),
  }),
  fc.record({
    type: fc.constant("assistant.message_finished" as const),
    messageId: fc.constantFrom("asst-1", "asst-2"),
  }),
  fc.record({
    type: fc.constant("interaction.requested" as const),
    callId: fc.constantFrom("c1", "c2", "c3"),
    kind: fc.constant("permission" as const),
    permission: fc.record({
      capability: fc.constantFrom("delete_path", "run_shell", "read_file"),
      input: fc.constant({}),
      risk: fc.constantFrom("low" as const, "medium" as const, "high" as const),
    }),
  }),
  fc.record({
    type: fc.constant("interaction.resolved" as const),
    callId: fc.constantFrom("c1", "c2", "c3"),
    kind: fc.constant("permission" as const),
    permission: fc.record({
      decision: fc.constantFrom("approved" as const, "denied" as const),
    }),
  }),
  fc.record({
    type: fc.constant("capability.requested" as const),
    callId: fc.constantFrom("c1", "c2"),
    capability: fc.constant("read_file"),
    input: fc.constant({}),
  }),
  fc.record({
    type: fc.constant("capability.completed" as const),
    callId: fc.constantFrom("c1", "c2"),
    capability: fc.constant("read_file"),
    output: fc.constant({ ok: true }),
  }),
  fc.record({
    type: fc.constant("entitlement.denied" as const),
    checkKind: fc.constant("capability" as const),
    outcome: fc.constant("deny" as const),
    reason: fc.constant("blocked"),
    capability: fc.constant("mouse_click"),
  }),
  fc.record({
    type: fc.constant("usage.updated" as const),
    modelId: fc.constant("openai/gpt-4o"),
    usedTokens: fc.nat({ max: 10_000 }),
    maxTokens: fc.nat({ max: 100_000 }),
  }),
  fc.record({
    type: fc.constant("budget.updated" as const),
    stepsUsed: fc.nat({ max: 50 }),
    maxSteps: fc.nat({ max: 50 }),
    costUsd: fc.double({ min: 0, max: 5, noNaN: true }),
    maxCostUsd: fc.double({ min: 0, max: 10, noNaN: true }),
    elapsedMs: fc.nat({ max: 60_000 }),
    maxWallClockMs: fc.nat({ max: 60_000 }),
  }),
  fc.record({
    type: fc.constant("budget.exceeded" as const),
    dimension: fc.constantFrom("steps" as const, "cost" as const, "wall_clock" as const),
  }),
  fc.record({
    type: fc.constant("activity.marker" as const),
    markerId: fc.constantFrom("m1", "m2"),
    text: fc.string({ maxLength: 12 }),
    variant: fc.constant("separator" as const),
  }),
);

const uniqueEventSequenceArb: fc.Arbitrary<RuntimeEvent[]> = fc
  .array(payloadArb, { minLength: 0, maxLength: 30 })
  .map((payloads) =>
    payloads.map((payload, index) => withEnvelope(`e-${index}`, payload, 1_000 + index)),
  );

function foldAll(events: readonly RuntimeEvent[]): FoldState {
  let state = createFoldState();
  for (const event of events) {
    state = reduceFold(state, event);
  }
  return state;
}

function projectionKey(state: FoldState) {
  const projection = toProjection(state);
  return {
    attemptId: projection.attemptId,
    status: projection.status,
    failure: projection.failure,
    rows: projection.rows,
    chatMessages: projection.chatMessages,
    pendingInteractions: projection.pendingInteractions,
    usage: projection.usage,
    budget: projection.budget,
    streamingMessageId: projection.streamingMessageId,
  };
}

describe("fold invariants (property)", () => {
  test("projectMandate ≡ sequential reduceFold", () => {
    fc.assert(
      fc.property(uniqueEventSequenceArb, (events) => {
        const fromBatch = projectMandate(events);
        const fromReduce = toProjection(foldAll(events));
        expect(fromBatch).toEqual(fromReduce);
      }),
      { numRuns: 80 },
    );
  });

  test("seenEventIds grows by at most one per reduce; duplicates are identity", () => {
    fc.assert(
      fc.property(uniqueEventSequenceArb, fc.nat(), (events, pick) => {
        if (events.length === 0) return;
        const index = pick % events.length;
        const event = events[index];
        if (!event) return;

        let state = foldAll(events.slice(0, index));
        const beforeSize = state.seenEventIds.size;
        const beforeRef = state;

        state = reduceFold(state, event);
        expect(state.seenEventIds.has(event.eventId)).toBe(true);
        expect(state.seenEventIds.size).toBe(beforeSize + 1);

        const afterFirst = state;
        state = reduceFold(state, event);
        expect(state).toBe(afterFirst);
        expect(state.seenEventIds.size).toBe(beforeSize + 1);

        // Prefix without this event must differ in seen size.
        expect(beforeRef.seenEventIds.size).toBe(beforeSize);
      }),
      { numRuns: 60 },
    );
  });

  test("appending a previously-seen eventId is a no-op on projection", () => {
    fc.assert(
      fc.property(uniqueEventSequenceArb, fc.nat(), (events, pick) => {
        if (events.length === 0) return;
        const source = events[pick % events.length];
        if (!source) return;
        // Duplicate only after the original has been applied — order of first
        // occurrence still matters; replaying an already-seen id must not.
        expect(projectionKey(foldAll([...events, source]))).toEqual(projectionKey(foldAll(events)));
      }),
      { numRuns: 60 },
    );
  });

  test("capability / entitlement events never mutate rows or pendingInteractions", () => {
    const noopPayloadArb = fc.oneof(
      fc.constant({
        type: "capability.requested" as const,
        callId: "cx",
        capability: "read_file",
        input: {},
      }),
      fc.constant({
        type: "capability.completed" as const,
        callId: "cx",
        capability: "read_file",
        output: { ok: true },
      }),
      fc.constant({
        type: "capability.failed" as const,
        callId: "cx",
        capability: "read_file",
        error: { code: "x", message: "y" },
      }),
      fc.constant({
        type: "entitlement.denied" as const,
        checkKind: "capability" as const,
        outcome: "deny" as const,
        reason: "no",
        capability: "mouse_click",
      }),
      fc.constant({
        type: "entitlement.metered" as const,
        meterKey: "attempts",
        amount: 1,
        newValue: 1,
        checkKind: "attempt_start" as const,
      }),
    );

    fc.assert(
      fc.property(uniqueEventSequenceArb, noopPayloadArb, (prefix, payload) => {
        const state = foldAll(prefix);
        const next = reduceFold(
          state,
          withEnvelope(`noop-${prefix.length}`, payload, 9_000 + prefix.length),
        );
        expect(next.rows).toBe(state.rows);
        expect(next.pendingInteractions).toBe(state.pendingInteractions);
        expect(next.status).toBe(state.status);
        expect(next.failure).toBe(state.failure);
        expect(next.streamingMessageId).toBe(state.streamingMessageId);
      }),
      { numRuns: 50 },
    );
  });

  test("interaction events never mutate transcript rows", () => {
    const interactionArb = fc.oneof(
      fc.record({
        type: fc.constant("interaction.requested" as const),
        callId: fc.constantFrom("c1", "c2"),
        kind: fc.constant("permission" as const),
        permission: fc.constant({
          capability: "delete_path",
          input: {},
          risk: "high" as const,
        }),
      }),
      fc.record({
        type: fc.constant("interaction.resolved" as const),
        callId: fc.constantFrom("c1", "c2"),
        kind: fc.constant("permission" as const),
        permission: fc.record({
          decision: fc.constantFrom("approved" as const, "denied" as const),
        }),
      }),
    );

    fc.assert(
      fc.property(uniqueEventSequenceArb, interactionArb, (prefix, payload) => {
        const state = foldAll(prefix);
        const next = reduceFold(
          state,
          withEnvelope(`ix-${prefix.length}`, payload, 8_000 + prefix.length),
        );
        expect(next.rows).toBe(state.rows);
      }),
      { numRuns: 50 },
    );
  });

  test("pendingInteractions callIds are unique", () => {
    fc.assert(
      fc.property(uniqueEventSequenceArb, (events) => {
        const pending = foldAll(events).pendingInteractions;
        const ids = pending.map((p) => p.callId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 80 },
    );
  });

  test("chatMessages are exactly the message rows in order", () => {
    fc.assert(
      fc.property(uniqueEventSequenceArb, (events) => {
        const state = foldAll(events);
        const projection = toProjection(state);
        const fromRows = state.rows
          .filter((row) => row.type === "message")
          .map((row) => (row.type === "message" ? row.message : null))
          .filter((message) => message !== null);
        expect(projection.chatMessages).toEqual(fromRows);
      }),
      { numRuns: 60 },
    );
  });
});
