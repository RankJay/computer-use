import { describe, expect, test } from "bun:test";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import type { RuntimeEvent } from "@/lib/session/events";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { runAgentLoop } from "./run-agent";

describe("run-agent", () => {
  test("streams assistant text and completes", async () => {
    const events: RuntimeEvent[] = [];

    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Hello" },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: "stop",
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      }),
    });

    const result = await runAgentLoop({
      taskId: "task-test",
      messages: [
        {
          id: "user-test",
          role: "user",
          parts: [{ type: "text", text: "Say hello" }],
        },
      ],
      modelId: "openai/gpt-4o-mini",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
      signal: new AbortController().signal,
      modelOverride: model,
      emit: (payload) => {
        events.push({
          ...payload,
          eventId: `evt-${events.length}`,
          taskId: "task-test",
          timestamp: events.length,
        } as RuntimeEvent);
      },
    });

    expect(result.finishReason).toBe("stop");
    expect(events.some((event) => event.type === "assistant.part_updated")).toBe(true);
    expect(events.some((event) => event.type === "task.status_changed")).toBe(true);

    const started = events.find((event) => event.type === "assistant.message_started");
    expect(started?.type).toBe("assistant.message_started");
    if (started?.type === "assistant.message_started") {
      expect(started.messageId).toBe("assistant-task-test");
    }
  });

  test("uses a distinct assistant message id per task", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Reply" },
            { type: "text-end", id: "text-1" },
            {
              type: "finish",
              finishReason: "stop",
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          ],
        }),
      }),
    });

    async function collectAssistantMessageId(taskId: string): Promise<string | undefined> {
      const events: RuntimeEvent[] = [];
      await runAgentLoop({
        taskId,
        messages: [
          {
            id: `user-${taskId}`,
            role: "user",
            parts: [{ type: "text", text: "Hi" }],
          },
        ],
        modelId: "openai/gpt-4o-mini",
        settings: DEFAULT_SETTINGS,
        secrets: DEFAULT_SECRETS,
        signal: new AbortController().signal,
        modelOverride: model,
        emit: (payload) => {
          events.push({
            ...payload,
            eventId: `evt-${events.length}`,
            taskId,
            timestamp: events.length,
          } as RuntimeEvent);
        },
      });

      const started = events.find((event) => event.type === "assistant.message_started");
      return started?.type === "assistant.message_started" ? started.messageId : undefined;
    }

    const firstId = await collectAssistantMessageId("task-one");
    const secondId = await collectAssistantMessageId("task-two");

    expect(firstId).toBe("assistant-task-one");
    expect(secondId).toBe("assistant-task-two");
    expect(firstId).not.toBe(secondId);
  });

  test("emits auth failure when API key missing", async () => {
    const events: RuntimeEvent[] = [];

    const result = await runAgentLoop({
      taskId: "task-auth",
      messages: [
        {
          id: "user-auth",
          role: "user",
          parts: [{ type: "text", text: "Hi" }],
        },
      ],
      modelId: "openai/gpt-4o-mini",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
      signal: new AbortController().signal,
      emit: (payload) => {
        events.push({
          ...payload,
          eventId: `evt-${events.length}`,
          taskId: "task-auth",
          timestamp: events.length,
        } as RuntimeEvent);
      },
    });

    expect(result.finishReason).toBe("error");
    const failure = events.find((event) => event.type === "task.failed");
    expect(failure?.type).toBe("task.failed");
    if (failure?.type === "task.failed") {
      expect(["auth", "desktop_required"]).toContain(failure.code);
    }
  });
});
