import { describe, expect, test } from "bun:test";
import { buildTranscriptRenderItems } from "./transcriptRender";
import type { AgentTimelineItem } from "@/agent/types";

describe("buildTranscriptRenderItems", () => {
  test("merges consecutive assistant rows without activity into one turn", () => {
    const timeline: AgentTimelineItem[] = [
      { id: "user-1", at: 1, kind: "user", text: "Hi" },
      { id: "a-1", at: 2, kind: "assistant", text: "First", status: "complete" },
      { id: "a-2", at: 3, kind: "assistant", text: "Second", status: "complete" },
    ];

    const items = buildTranscriptRenderItems(timeline);

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      kind: "assistant-turn",
      id: "a-1",
      copyText: "First Second",
      isStreaming: false,
    });

    const turn = items[1];
    if (turn?.kind !== "assistant-turn") throw new Error("expected assistant turn");
    expect(turn.parts).toEqual([{ kind: "text", text: "First Second", isStreaming: false }]);
  });

  test("merges assistant text interrupted by activity into one turn", () => {
    const timeline: AgentTimelineItem[] = [
      { id: "user-1", at: 1, kind: "user", text: "pwd?" },
      {
        id: "a-1",
        at: 2,
        kind: "assistant",
        text: "I'll check your current working directory using the ",
        status: "complete",
      },
      {
        id: "activity-1",
        at: 3,
        kind: "activity",
        taskId: "task-1",
        status: "completed",
        rows: [{ id: "tool-1", title: "Running terminal.run" }],
      },
      {
        id: "a-2",
        at: 4,
        kind: "assistant",
        text: "terminal.\n\nYour pwd is:\n`D:\\Projects\\actuate`",
        status: "complete",
      },
    ];

    const items = buildTranscriptRenderItems(timeline);

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      kind: "assistant-turn",
      id: "a-1",
      copyText:
        "I'll check your current working directory using the terminal.\n\nYour pwd is:\n`D:\\Projects\\actuate`",
      isStreaming: false,
    });

    const turn = items[1];
    if (turn?.kind !== "assistant-turn") throw new Error("expected assistant turn");

    expect(turn.parts).toEqual([
      {
        kind: "text",
        text: "I'll check your current working directory using the ",
        isStreaming: false,
      },
      {
        kind: "activity",
        id: "activity-1",
        rows: [{ id: "tool-1", title: "Running terminal.run" }],
        status: "completed",
      },
      {
        kind: "text",
        text: "terminal.\n\nYour pwd is:\n`D:\\Projects\\actuate`",
        isStreaming: false,
      },
    ]);
  });

  test("joins assistant segments split across activity with a word boundary space", () => {
    const timeline: AgentTimelineItem[] = [
      { id: "user-1", at: 1, kind: "user", text: "Hi" },
      { id: "a-1", at: 2, kind: "assistant", text: "guide:", status: "complete" },
      {
        id: "activity-1",
        at: 3,
        kind: "activity",
        taskId: "task-1",
        status: "completed",
        rows: [{ id: "tool-1", title: "Running terminal.run", detail: "pwd" }],
      },
      { id: "a-2", at: 4, kind: "assistant", text: "Since we need a path.", status: "complete" },
    ];

    const items = buildTranscriptRenderItems(timeline);
    const turn = items[1];
    if (turn?.kind !== "assistant-turn") throw new Error("expected assistant turn");

    expect(turn.copyText).toBe("guide: Since we need a path.");
    expect(turn.parts).toEqual([
      { kind: "text", text: "guide:", isStreaming: false },
      {
        kind: "activity",
        id: "activity-1",
        rows: [{ id: "tool-1", title: "Running terminal.run", detail: "pwd" }],
        status: "completed",
      },
      { kind: "text", text: "Since we need a path.", isStreaming: false },
    ]);
  });

  test("interleaves activity blocks between assistant text segments in one turn", () => {
    const timeline: AgentTimelineItem[] = [
      { id: "user-1", at: 1, kind: "user", text: "Explore" },
      { id: "a-1", at: 2, kind: "assistant", text: "Checking pwd.", status: "complete" },
      {
        id: "activity-1",
        at: 3,
        kind: "activity",
        taskId: "task-1",
        status: "completed",
        rows: [{ id: "tool-1", title: "Running terminal.run", detail: "pwd" }],
      },
      { id: "a-2", at: 4, kind: "assistant", text: "Now listing files.", status: "complete" },
      {
        id: "activity-2",
        at: 5,
        kind: "activity",
        taskId: "task-1",
        status: "completed",
        rows: [{ id: "tool-2", title: "Running terminal.run", detail: "ls" }],
      },
      { id: "a-3", at: 6, kind: "assistant", text: "Here is the summary.", status: "complete" },
    ];

    const items = buildTranscriptRenderItems(timeline);
    expect(items).toHaveLength(2);

    const turn = items[1];
    if (turn?.kind !== "assistant-turn") throw new Error("expected assistant turn");

    expect(turn.parts.map((part) => part.kind)).toEqual([
      "text",
      "activity",
      "text",
      "activity",
      "text",
    ]);
  });

  test("does not show copy until the merged turn stops streaming", () => {
    const timeline: AgentTimelineItem[] = [
      { id: "user-1", at: 1, kind: "user", text: "pwd?" },
      { id: "a-1", at: 2, kind: "assistant", text: "Partial ", status: "complete" },
      {
        id: "activity-1",
        at: 3,
        kind: "activity",
        taskId: "task-1",
        status: "active",
        rows: [{ id: "tool-1", title: "Running terminal.run" }],
      },
      { id: "a-2", at: 4, kind: "assistant", text: "rest", status: "streaming" },
    ];

    const items = buildTranscriptRenderItems(timeline);
    const turn = items[1];

    expect(turn).toMatchObject({
      kind: "assistant-turn",
      isStreaming: true,
    });
  });
});
