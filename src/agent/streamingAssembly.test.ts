import { describe, expect, test } from "bun:test";
import {
  applyAssistantStreamEvent,
  trimLastAssistantMessage,
  type AssistantStreamAssembly,
} from "./streamingAssembly";
import type { AgentEvent, AgentTimelineItem } from "./types";

const taskId = "task-1";

function baseEvent(id: string): Pick<AgentEvent, "id" | "at" | "taskId"> {
  return { id, at: 1000, taskId };
}

function emptyAssembly(): AssistantStreamAssembly {
  return {
    timeline: [],
    assistantStream: "",
  };
}

describe("streamingAssembly", () => {
  test("one delta updates the active assistant stream", () => {
    const assembly = applyAssistantStreamEvent(emptyAssembly(), {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Hello",
    });

    expect(assembly.assistantStream).toBe("Hello");
    expect(assembly.timeline).toEqual([]);
  });

  test("multiple deltas concatenate in order", () => {
    let assembly = emptyAssembly();

    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Hello ",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-2"),
      type: "assistant.text.delta",
      text: "there",
    });

    expect(assembly.assistantStream).toBe("Hello there");
  });

  test("done flushes one trimmed assistant timeline row", () => {
    let assembly = emptyAssembly();

    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: " Done. ",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(assembly.timeline).toEqual([
      { id: "done-1", at: 1000, kind: "assistant", text: "Done." },
    ]);
  });

  test("done clears the active assistant stream", () => {
    let assembly = emptyAssembly();

    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Done.",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(assembly.assistantStream).toBe("");
  });

  test("done without deltas does not create a blank assistant row", () => {
    const assembly = applyAssistantStreamEvent(emptyAssembly(), {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(assembly.assistantStream).toBe("");
    expect(assembly.timeline).toEqual([]);
  });

  test("a second delta and done cycle creates a second assistant row", () => {
    let assembly = emptyAssembly();

    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "First",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("delta-2"),
      type: "assistant.text.delta",
      text: "Second",
    });
    assembly = applyAssistantStreamEvent(assembly, {
      ...baseEvent("done-2"),
      type: "assistant.text.done",
    });

    expect(assembly.timeline).toEqual([
      { id: "done-1", at: 1000, kind: "assistant", text: "First" },
      { id: "done-2", at: 1000, kind: "assistant", text: "Second" },
    ]);
  });

  test("trim removes trailing assistant rows and clears the active stream", () => {
    const userItem: AgentTimelineItem = { id: "user-1", at: 900, kind: "user", text: "Prompt" };
    const firstAssistant: AgentTimelineItem = {
      id: "assistant-1",
      at: 1000,
      kind: "assistant",
      text: "First",
    };
    const secondAssistant: AgentTimelineItem = {
      id: "assistant-2",
      at: 1100,
      kind: "assistant",
      text: "Second",
    };

    const assembly = trimLastAssistantMessage({
      timeline: [userItem, firstAssistant, secondAssistant],
      assistantStream: "Partial",
    });

    expect(assembly).toEqual({
      timeline: [userItem],
      assistantStream: "",
    });
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
    };

    const assembly = trimLastAssistantMessage({
      timeline: [userItem, activityItem, assistantItem],
      assistantStream: "",
    });

    expect(assembly.timeline).toEqual([userItem]);
  });
});
