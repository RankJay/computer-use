import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { createEmptyMandateProjection, type MandateProjection } from "../projection";
import type { AgentTranscriptRow } from "../rows";
import { deriveDisplayRows } from "./derive-display-rows";

function projection(partial: Partial<MandateProjection>): MandateProjection {
  return { ...createEmptyMandateProjection(), ...partial };
}

function userRow(id: string, text: string): AgentTranscriptRow {
  return {
    type: "message",
    id,
    message: {
      id,
      role: "user",
      parts: [{ type: "text", text }],
    },
  };
}

function assistantRow(id: string, parts: UIMessage["parts"]): AgentTranscriptRow {
  return {
    type: "message",
    id,
    message: {
      id,
      role: "assistant",
      parts,
    },
  };
}

describe("deriveDisplayRows", () => {
  test("live running with empty assistant parts inserts Thinking marker before assistant", () => {
    const taskId = "task-1";
    const assistantId = `assistant-${taskId}`;
    const rows: AgentTranscriptRow[] = [userRow("user-1", "hi"), assistantRow(assistantId, [])];

    const display = deriveDisplayRows(
      projection({
        taskId,
        status: "running",
        streamingMessageId: assistantId,
        rows,
      }),
    );

    expect(display).toHaveLength(3);
    expect(display[1]).toEqual({
      type: "marker",
      id: `live-thinking-${taskId}`,
      text: "Thinking…",
      live: true,
      status: true,
    });
    expect(display[2]?.id).toBe(assistantId);
    expect(rows).toHaveLength(2);
  });

  test("live running before assistant row inserts marker after user", () => {
    const taskId = "task-2";
    const rows: AgentTranscriptRow[] = [userRow("user-1", "hi")];

    const display = deriveDisplayRows(
      projection({
        taskId,
        status: "running",
        streamingMessageId: null,
        rows,
      }),
    );

    expect(display).toHaveLength(2);
    expect(display[0]?.id).toBe("user-1");
    expect(display[1]).toMatchObject({
      type: "marker",
      id: `live-thinking-${taskId}`,
      text: "Thinking…",
    });
  });

  test("reasoning streaming skips marker", () => {
    const taskId = "task-3";
    const assistantId = `assistant-${taskId}`;
    const rows: AgentTranscriptRow[] = [
      userRow("user-1", "hi"),
      assistantRow(assistantId, [{ type: "reasoning", text: "Considering…", state: "streaming" }]),
    ];

    const display = deriveDisplayRows(
      projection({
        taskId,
        status: "streaming",
        streamingMessageId: assistantId,
        rows,
      }),
    );

    expect(display).toBe(rows);
  });

  test("text part present skips marker", () => {
    const taskId = "task-4";
    const assistantId = `assistant-${taskId}`;
    const rows: AgentTranscriptRow[] = [
      userRow("user-1", "hi"),
      assistantRow(assistantId, [{ type: "text", text: "Hello" }]),
    ];

    const display = deriveDisplayRows(
      projection({
        taskId,
        status: "streaming",
        streamingMessageId: assistantId,
        rows,
      }),
    );

    expect(display).toBe(rows);
  });

  test("tool part present skips marker", () => {
    const taskId = "task-5";
    const assistantId = `assistant-${taskId}`;
    const rows: AgentTranscriptRow[] = [
      userRow("user-1", "hi"),
      assistantRow(assistantId, [
        {
          type: "dynamic-tool",
          toolName: "read_file",
          toolCallId: "c1",
          state: "input-available",
          input: { path: "a.ts" },
        },
      ]),
    ];

    const display = deriveDisplayRows(
      projection({
        taskId,
        status: "waiting_interaction",
        streamingMessageId: assistantId,
        rows,
      }),
    );

    expect(display).toBe(rows);
  });

  test("demo-shaped projection with CoT/task is passthrough", () => {
    const rows: AgentTranscriptRow[] = [
      { type: "marker", id: "marker-today", variant: "separator", text: "Today" },
      userRow("user-1", "hi"),
      {
        type: "chain-of-thought",
        id: "cot-1",
        steps: [{ label: "Search", status: "complete" }],
      },
      {
        type: "task",
        id: "task-block",
        title: "Found files",
        items: ["a.ts"],
      },
    ];

    const display = deriveDisplayRows(
      projection({
        taskId: "demo-task",
        status: "streaming",
        rows,
      }),
    );

    expect(display).toBe(rows);
  });

  test("terminal statuses skip synthetic marker", () => {
    const taskId = "task-6";
    const rows: AgentTranscriptRow[] = [userRow("user-1", "hi")];

    for (const status of ["idle", "completed", "failed", "cancelled"] as const) {
      const display = deriveDisplayRows(projection({ taskId, status, rows }));
      expect(display).toBe(rows);
    }
  });

  test("Thinking marker identity is stable across identical derives", () => {
    const taskId = "task-stable";
    const rows: AgentTranscriptRow[] = [userRow("user-1", "hi")];
    const input = projection({ taskId, status: "running", rows });

    const first = deriveDisplayRows(input);
    const second = deriveDisplayRows(input);

    expect(second).toBe(first);
    expect(second[1]).toBe(first[1]);
  });
});
