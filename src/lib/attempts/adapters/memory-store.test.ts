import { describe, expect, test } from "bun:test";

import { RUNTIME_EVENT_SCHEMA_VERSION, type RuntimeEvent } from "@/lib/session/events";
import { createEmptyMandateProjection } from "@/lib/session/projection";

import { projectionToFoldSnapshot } from "../fold-snapshot";
import { MemoryAttemptEventStore } from "./memory-store";

function event(
  attemptId: string,
  eventId: string,
  type: "task.started" | "task.completed" | "assistant.part_updated",
  extra: Record<string, unknown> = {},
): RuntimeEvent {
  const base = {
    eventId,
    taskId: attemptId,
    timestamp: Date.now(),
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
  };
  switch (type) {
    case "task.started":
      return {
        ...base,
        type,
        prompt: "hi",
        modelId: "m",
        agentMode: "demo",
        ...extra,
      };
    case "task.completed":
      return { ...base, type, finishReason: "stop", ...extra };
    case "assistant.part_updated":
      return {
        ...base,
        type,
        messageId: "msg",
        partIndex: 0,
        part: { type: "text", text: "x" },
        ...extra,
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

describe("MemoryAttemptEventStore", () => {
  test("open uses settle snapshot + event tail only", async () => {
    const store = new MemoryAttemptEventStore();
    const mandateId = "man-1";
    const attemptId = "att-1";

    await store.beginAttempt({ attemptId, mandateId, startedAt: 1 });
    await store.appendEvents({
      attemptId,
      mandateId,
      events: [
        event(attemptId, "e1", "task.started"),
        event(attemptId, "e2", "assistant.part_updated", {
          part: { type: "text", text: "Hello" },
        }),
        event(attemptId, "e3", "task.completed"),
      ],
    });

    const projection = createEmptyMandateProjection();
    const snap = projectionToFoldSnapshot({
      ...projection,
      taskId: attemptId,
      status: "completed",
      chatMessages: [
        { id: "u", role: "user", parts: [{ type: "text", text: "hi" }] },
        { id: "msg", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
      ],
      rows: [
        {
          type: "message",
          id: "u",
          message: { id: "u", role: "user", parts: [{ type: "text", text: "hi" }] },
        },
        {
          type: "message",
          id: "msg",
          message: { id: "msg", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
        },
      ],
    });

    await store.settleAttempt({
      attemptId,
      mandateId,
      status: "completed",
      lastSeq: 3,
      snapshot: snap,
    });

    // Tail after settle should be empty when lastSeq covers all events.
    const open = await store.loadForMandateOpen(mandateId);
    expect(open).not.toBeNull();
    expect(open?.snapshot?.status).toBe("completed");
    expect(open?.events).toHaveLength(0);
    expect(open?.snapshot?.chatMessages).toHaveLength(2);
  });

  test("unsettled attempt replays events when no snapshot", async () => {
    const store = new MemoryAttemptEventStore();
    const mandateId = "man-2";
    const attemptId = "att-2";

    await store.appendEvents({
      attemptId,
      mandateId,
      events: [
        event(attemptId, "e1", "task.started"),
        event(attemptId, "e2", "assistant.part_updated", {
          part: { type: "text", text: "partial" },
        }),
      ],
    });

    const open = await store.loadForMandateOpen(mandateId);
    expect(open?.snapshot).toBeNull();
    expect(open?.events).toHaveLength(2);
  });

  test("coalesces part_updated inside appendEvents", async () => {
    const store = new MemoryAttemptEventStore();
    const attemptId = "att-3";
    const mandateId = "man-3";

    const lastSeq = await store.appendEvents({
      attemptId,
      mandateId,
      events: [
        event(attemptId, "e1", "assistant.part_updated", {
          part: { type: "text", text: "a" },
        }),
        event(attemptId, "e2", "assistant.part_updated", {
          part: { type: "text", text: "ab" },
        }),
        event(attemptId, "e3", "assistant.part_updated", {
          part: { type: "text", text: "abc" },
        }),
      ],
    });

    expect(lastSeq).toBe(1);
    const open = await store.loadForMandateOpen(mandateId);
    expect(open?.events).toHaveLength(1);
    expect(open?.events[0]).toMatchObject({
      type: "assistant.part_updated",
      part: { text: "abc" },
    });
  });
});
