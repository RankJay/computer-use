import { describe, expect, test } from "bun:test";

import { demoRunEvents, DEMO_TASK_ID } from "./fixtures/demo-run-events";
import { projectSession, projectSessionIncremental } from "./project-session";
import { createEmptySessionProjection, deriveControlFlags } from "./projection";

const demoProjection = projectSession(demoRunEvents);

describe("project-session", () => {
  test("demo events produce completed transcript with all block types", () => {
    const projection = projectSession(demoRunEvents);

    expect(projection.taskId).toBe(DEMO_TASK_ID);
    expect(projection.status).toBe("completed");
    expect(projection.usage.usedTokens).toBe(12_400);
    expect(projection.usage.modelId).toBe("openai/gpt-4o");
    expect(deriveControlFlags(projection.status).canSubmit).toBe(true);

    expect(projection.rows.map((row) => row.type)).toEqual([
      "marker",
      "message",
      "marker",
      "chain-of-thought",
      "task",
      "message",
      "message",
      "marker",
      "message",
    ]);
  });

  test("projection is deterministic for the same event order", () => {
    const first = projectSession(demoRunEvents);
    const second = projectSession(demoRunEvents);
    expect(first).toEqual(second);
  });

  test("duplicate event ids are ignored", () => {
    const duplicated = [...demoRunEvents, demoRunEvents[0]!];
    const projection = projectSession(duplicated);
    expect(projection.rows).toEqual(demoProjection.rows);
  });

  test("incremental fold matches batch fold", () => {
    let incremental = createEmptySessionProjection();

    for (const event of demoRunEvents) {
      incremental = projectSessionIncremental(incremental, event);
    }

    const batch = projectSession(demoRunEvents);

    expect(incremental).toEqual(batch);
  });

  test("chatMessages tracks user and assistant turns in order", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "First question",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "assistant.message_started",
        messageId: "assistant-1",
        role: "assistant",
      },
      {
        eventId: "e3",
        taskId: "t1",
        timestamp: 3,
        type: "assistant.part_updated",
        messageId: "assistant-1",
        partIndex: 0,
        part: { type: "text", text: "First answer" },
      },
      {
        eventId: "e4",
        taskId: "t2",
        timestamp: 4,
        type: "task.started",
        prompt: "Second question",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-2",
      },
      {
        eventId: "e5",
        taskId: "t1",
        timestamp: 5,
        type: "activity.marker",
        markerId: "marker-1",
        text: "Working",
      },
    ]);

    expect(projection.chatMessages).toHaveLength(3);
    expect(projection.chatMessages[0]?.role).toBe("user");
    expect(projection.chatMessages[0]?.parts[0]).toEqual({
      type: "text",
      text: "First question",
    });
    expect(projection.chatMessages[1]?.role).toBe("assistant");
    expect(projection.chatMessages[2]?.role).toBe("user");
  });

  test("accumulates distinct assistant messages across turns", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Turn one",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "assistant.message_started",
        messageId: "assistant-t1",
        role: "assistant",
      },
      {
        eventId: "e3",
        taskId: "t1",
        timestamp: 3,
        type: "assistant.part_updated",
        messageId: "assistant-t1",
        partIndex: 0,
        part: { type: "text", text: "First answer" },
      },
      {
        eventId: "e4",
        taskId: "t2",
        timestamp: 4,
        type: "task.started",
        prompt: "Turn two",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-2",
      },
      {
        eventId: "e5",
        taskId: "t2",
        timestamp: 5,
        type: "assistant.message_started",
        messageId: "assistant-t2",
        role: "assistant",
      },
      {
        eventId: "e6",
        taskId: "t2",
        timestamp: 6,
        type: "assistant.part_updated",
        messageId: "assistant-t2",
        partIndex: 0,
        part: { type: "text", text: "Second answer" },
      },
    ]);

    const assistantRows = projection.rows.filter(
      (row) => row.type === "message" && row.message.role === "assistant",
    );

    expect(assistantRows).toHaveLength(2);
    expect(assistantRows[0]?.type).toBe("message");
    expect(assistantRows[1]?.type).toBe("message");
    if (assistantRows[0]?.type === "message" && assistantRows[1]?.type === "message") {
      expect(assistantRows[0].message.parts[0]).toEqual({
        type: "text",
        text: "First answer",
      });
      expect(assistantRows[1].message.parts[0]).toEqual({
        type: "text",
        text: "Second answer",
      });
    }
  });

  test("accumulates user rows across multiple task.started events", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Turn one",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "task.completed",
        finishReason: "stop",
      },
      {
        eventId: "e3",
        taskId: "t2",
        timestamp: 3,
        type: "task.started",
        prompt: "Turn two",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-2",
      },
    ]);

    const userRows = projection.rows.filter(
      (row) => row.type === "message" && row.message.role === "user",
    );

    expect(userRows).toHaveLength(2);
  });

  test("permission.requested sets waiting state", () => {
    const events = [
      ...demoRunEvents.slice(0, 15),
      {
        ...demoRunEvents[15]!,
        eventId: "perm-req",
        type: "permission.requested" as const,
        callId: "tool-delete-approval",
        capability: "delete_file",
        input: { filePath: "/tmp/example.txt" },
        risk: "high" as const,
      },
    ];

    const projection = projectSession(events);
    expect(projection.status).toBe("waiting_permission");
    expect(projection.pendingPermission?.callId).toBe("tool-delete-approval");
    expect(projection.inputDisabled).toBe(true);
    expect(projection.cancelVisible).toBe(true);
  });

  test("permission.requested updates matching dynamic tool part", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Delete a file",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "assistant.message_started",
        messageId: "assistant-1",
        role: "assistant",
      },
      {
        eventId: "e3",
        taskId: "t1",
        timestamp: 3,
        type: "assistant.part_updated",
        messageId: "assistant-1",
        partIndex: 0,
        part: {
          type: "dynamic-tool",
          toolCallId: "call-delete",
          toolName: "delete_file",
          state: "input-available",
          input: { filePath: "/tmp/example.txt" },
        },
      },
      {
        eventId: "e4",
        taskId: "t1",
        timestamp: 4,
        type: "permission.requested",
        callId: "call-delete",
        capability: "delete_file",
        input: { filePath: "/tmp/example.txt" },
        risk: "high",
      },
    ]);

    const assistantRow = projection.rows.find(
      (row) => row.type === "message" && row.id === "assistant-1",
    );
    expect(assistantRow?.type).toBe("message");
    if (assistantRow?.type === "message") {
      expect(assistantRow.message.parts[0]).toEqual({
        type: "dynamic-tool",
        toolCallId: "call-delete",
        toolName: "delete_file",
        state: "approval-requested",
        approval: { id: "call-delete" },
        input: { filePath: "/tmp/example.txt" },
      });
    }
  });

  test("permission.resolved denied marks tool output error", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Delete a file",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "assistant.message_started",
        messageId: "assistant-1",
        role: "assistant",
      },
      {
        eventId: "e3",
        taskId: "t1",
        timestamp: 3,
        type: "assistant.part_updated",
        messageId: "assistant-1",
        partIndex: 0,
        part: {
          type: "dynamic-tool",
          toolCallId: "call-delete",
          toolName: "delete_file",
          state: "approval-requested",
          approval: { id: "call-delete" },
          input: { filePath: "/tmp/example.txt" },
        },
      },
      {
        eventId: "e4",
        taskId: "t1",
        timestamp: 4,
        type: "permission.requested",
        callId: "call-delete",
        capability: "delete_file",
        input: { filePath: "/tmp/example.txt" },
        risk: "high",
      },
      {
        eventId: "e5",
        taskId: "t1",
        timestamp: 5,
        type: "permission.resolved",
        callId: "call-delete",
        decision: "denied",
      },
    ]);

    expect(projection.pendingPermission).toBeNull();
    expect(projection.status).toBe("running");

    const assistantRow = projection.rows.find(
      (row) => row.type === "message" && row.id === "assistant-1",
    );
    if (assistantRow?.type === "message") {
      expect(assistantRow.message.parts[0]).toMatchObject({
        state: "output-denied",
        approval: { id: "call-delete", approved: false },
      });
    }
  });

  test("task.failed appends assistant error row", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Hi",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "task.failed",
        code: "auth",
        message: "Missing API key",
        recoverable: true,
      },
    ]);

    expect(projection.status).toBe("failed");
    expect(projection.failure?.code).toBe("auth");

    const errorRow = projection.rows.find(
      (row) => row.type === "message" && row.id === "error-t1",
    );
    expect(errorRow?.type).toBe("message");
    if (errorRow?.type === "message") {
      expect(errorRow.message.parts[0]).toEqual({
        type: "text",
        text: "Error: Missing API key",
      });
    }
  });

  test("part snapshots replace message parts", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Hi",
        modelId: "openai/gpt-4o",
        agentMode: "demo",
        userMessageId: "msg-user",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "assistant.message_started",
        messageId: "msg-a",
        role: "assistant",
      },
      {
        eventId: "e3",
        taskId: "t1",
        timestamp: 3,
        type: "assistant.part_updated",
        messageId: "msg-a",
        partIndex: 0,
        part: { type: "reasoning", text: "Thinking", state: "streaming" },
      },
      {
        eventId: "e4",
        taskId: "t1",
        timestamp: 4,
        type: "assistant.part_updated",
        messageId: "msg-a",
        partIndex: 0,
        part: { type: "reasoning", text: "Thinking hard", state: "streaming" },
      },
      {
        eventId: "e5",
        taskId: "t1",
        timestamp: 5,
        type: "assistant.part_updated",
        messageId: "msg-a",
        partIndex: 1,
        part: { type: "text", text: "Hello" },
      },
    ]);

    const assistantRow = projection.rows.find(
      (row) => row.type === "message" && row.id === "msg-a",
    );
    expect(assistantRow?.type).toBe("message");
    if (assistantRow?.type === "message") {
      expect(assistantRow.message.parts[0]).toEqual({
        type: "reasoning",
        text: "Thinking hard",
        state: "streaming",
      });
      expect(assistantRow.message.parts[1]).toEqual({
        type: "text",
        text: "Hello",
      });
    }
  });
});

describe("reduceSession", () => {
  test("budget.exceeded marks session failed and appends error row", () => {
    const projection = projectSession([
      {
        eventId: "e1",
        taskId: "t1",
        timestamp: 1,
        type: "task.started",
        prompt: "Hi",
        modelId: "openai/gpt-4o",
        agentMode: "live",
        userMessageId: "user-1",
      },
      {
        eventId: "e2",
        taskId: "t1",
        timestamp: 2,
        type: "budget.exceeded",
        dimension: "steps",
      },
    ]);

    expect(projection.status).toBe("failed");
    expect(projection.failure?.code).toBe("budget_exceeded");

    const errorRow = projection.rows.find(
      (row) => row.type === "message" && row.id === "error-t1",
    );
    expect(errorRow?.type).toBe("message");
    if (errorRow?.type === "message") {
      expect(errorRow.message.parts[0]).toEqual({
        type: "text",
        text: "Error: Budget exceeded: steps",
      });
    }
  });
});
