import { describe, expect, test } from "bun:test";

import { applyDemoEvent, applyDemoEvents } from "./apply-demo-event";
import { createDemoRunEvents, demoRunEvents } from "./demo-run-events";
import { createEmptyTranscriptState } from "./types";

describe("applyDemoEvent", () => {
  test("preserves untouched row references on part update", () => {
    let state = createEmptyTranscriptState();
    state = applyDemoEvent(state, {
      type: "task.started",
      eventId: "e1",
      prompt: "hello",
      modelId: "openai/gpt-5.4",
      userMessageId: "msg-user-1",
    });
    state = applyDemoEvent(state, {
      type: "assistant.message_started",
      eventId: "e2",
      messageId: "msg-assistant-1",
      role: "assistant",
    });

    const userRow = state.rows[0];
    const assistantBefore = state.rows[1];
    expect(userRow?.type).toBe("message");
    expect(assistantBefore?.type).toBe("message");

    const next = applyDemoEvent(state, {
      type: "assistant.part_updated",
      eventId: "e3",
      messageId: "msg-assistant-1",
      partIndex: 0,
      part: { type: "text", text: "Hi" },
    });

    expect(Object.is(next.rows[0], userRow)).toBe(true);
    expect(Object.is(next.rows[1], assistantBefore)).toBe(false);
    expect(next.streamingMessageId).toBe("msg-assistant-1");
    expect(next.rows[1]?.type === "message" && next.rows[1].message.parts[0]).toEqual({
      type: "text",
      text: "Hi",
    });
  });

  test("projects full demo fixture into expected row types", () => {
    const state = applyDemoEvents(demoRunEvents);
    const types = state.rows.map((row) => row.type);

    expect(types).toContain("marker");
    expect(types).toContain("message");
    expect(types).toContain("chain-of-thought");
    expect(types).toContain("task");
    expect(state.status).toBe("completed");
    expect(state.streamingMessageId).toBeNull();

    const user = state.rows.find((row) => row.type === "message" && row.message.role === "user");
    expect(user?.type === "message" && user.message.parts[0]).toEqual({
      type: "text",
      text: "Refactor the control center to show an agent activity timeline with every block type.",
    });
  });

  test("createDemoRunEvents overrides the user prompt", () => {
    const events = createDemoRunEvents("custom prompt");
    const state = applyDemoEvents(events);
    const user = state.rows.find((row) => row.type === "message" && row.message.role === "user");
    expect(user?.type === "message" && user.message.parts[0]).toEqual({
      type: "text",
      text: "custom prompt",
    });
  });

  test("finished message rows stay referentially stable while a later message streams", () => {
    const events = createDemoRunEvents("hello");
    let state = createEmptyTranscriptState();
    let finishedAssistant: (typeof state.rows)[number] | undefined;

    for (const event of events) {
      state = applyDemoEvent(state, event);
      if (event.type === "assistant.message_finished" && event.messageId === "msg-assistant-1") {
        finishedAssistant = state.rows.find((row) => row.id === "msg-assistant-1");
      }
      if (
        finishedAssistant &&
        event.type === "assistant.part_updated" &&
        event.messageId === "msg-assistant-2"
      ) {
        const current = state.rows.find((row) => row.id === "msg-assistant-1");
        expect(Object.is(current, finishedAssistant)).toBe(true);
      }
    }

    expect(finishedAssistant).toBeDefined();
  });
});
