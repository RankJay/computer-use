import { describe, expect, test } from "bun:test";
import {
  applyAssistantStreamEvent,
  trimLastAssistantMessage,
} from "./streamingAssembly";
import type { AgentEvent, AgentTimelineItem } from "@/agent/types";

const taskId = "task-1";

function baseEvent(id: string): Pick<AgentEvent, "id" | "at" | "taskId"> {
  return { id, at: 1000, taskId };
}

describe("streamingAssembly", () => {
  test("one delta creates a streaming assistant timeline row", () => {
    const timeline = applyAssistantStreamEvent([], {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Hello",
    });

    expect(timeline).toEqual([
      {
        id: "delta-1",
        at: 1000,
        kind: "assistant",
        text: "Hello",
        status: "streaming",
      },
    ]);
  });

  test("multiple deltas append to the same streaming row", () => {
    let timeline = applyAssistantStreamEvent([], {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Hello ",
    });
    timeline = applyAssistantStreamEvent(timeline, {
      ...baseEvent("delta-2"),
      type: "assistant.text.delta",
      text: "there",
    });

    expect(timeline).toEqual([
      {
        id: "delta-1",
        at: 1000,
        kind: "assistant",
        text: "Hello there",
        status: "streaming",
      },
    ]);
  });

  test("done finalizes one trimmed assistant timeline row", () => {
    let timeline = applyAssistantStreamEvent([], {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: " Done. ",
    });
    timeline = applyAssistantStreamEvent(timeline, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(timeline).toEqual([
      { id: "done-1", at: 1000, kind: "assistant", text: "Done.", status: "complete" },
    ]);
  });

  test("done without deltas does not create a blank assistant row", () => {
    const timeline = applyAssistantStreamEvent([], {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(timeline).toEqual([]);
  });

  test("a second delta and done cycle creates a second assistant row", () => {
    let timeline = applyAssistantStreamEvent([], {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "First",
    });
    timeline = applyAssistantStreamEvent(timeline, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });
    timeline = applyAssistantStreamEvent(timeline, {
      ...baseEvent("delta-2"),
      type: "assistant.text.delta",
      text: "Second",
    });
    timeline = applyAssistantStreamEvent(timeline, {
      ...baseEvent("done-2"),
      type: "assistant.text.done",
    });

    expect(timeline).toEqual([
      { id: "done-1", at: 1000, kind: "assistant", text: "First", status: "complete" },
      { id: "done-2", at: 1000, kind: "assistant", text: "Second", status: "complete" },
    ]);
  });

  test("trim removes trailing assistant rows", () => {
    const userItem: AgentTimelineItem = { id: "user-1", at: 900, kind: "user", text: "Prompt" };
    const firstAssistant: AgentTimelineItem = {
      id: "assistant-1",
      at: 1000,
      kind: "assistant",
      text: "First",
      status: "complete",
    };
    const secondAssistant: AgentTimelineItem = {
      id: "assistant-2",
      at: 1100,
      kind: "assistant",
      text: "Second",
      status: "streaming",
    };

    const timeline = trimLastAssistantMessage([userItem, firstAssistant, secondAssistant]);

    expect(timeline).toEqual([userItem]);
  });

  test("trim removes the assistant activity block before regeneration", () => {
    const userItem: AgentTimelineItem = { id: "user-1", at: 900, kind: "user", text: "Prompt" };
    const activityItem: AgentTimelineItem = {
      id: "activity-1",
      at: 950,
      kind: "activity",
      taskId,
      status: "completed",
      rows: [{ id: "row-1", title: "Running terminal.run" }],
    };
    const assistantItem: AgentTimelineItem = {
      id: "assistant-1",
      at: 1000,
      kind: "assistant",
      text: "Answer",
      status: "complete",
    };

    const timeline = trimLastAssistantMessage([userItem, activityItem, assistantItem]);

    expect(timeline).toEqual([userItem]);
  });
});
