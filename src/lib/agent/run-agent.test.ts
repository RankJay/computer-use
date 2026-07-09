import { describe, expect, test } from "bun:test";

import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { runAgentLoop } from "./run-agent";

const STREAM_CHUNKS: LanguageModelV4StreamPart[] = [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: "Hello" },
  { type: "text-end", id: "text-1" },
  {
    type: "finish",
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
  },
];

function createMockModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: STREAM_CHUNKS }),
    }),
  });
}

describe("run-agent", () => {
  test("streams assistant text and completes", async () => {
    const payloads: RuntimeEventPayload[] = [];

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
      modelOverride: createMockModel(),
      append: (payload) => {
        payloads.push(payload);
      },
    });

    expect(result.finishReason).toBe("stop");
    expect(payloads.some((event) => event.type === "assistant.part_updated")).toBe(true);
    expect(payloads.some((event) => event.type === "task.status_changed")).toBe(true);

    const started = payloads.find((event) => event.type === "assistant.message_started");
    expect(started?.type).toBe("assistant.message_started");
    if (started?.type === "assistant.message_started") {
      expect(started.messageId).toBe("assistant-task-test");
    }
  });

  test("auth failure emits recoverable task.failed", async () => {
    const payloads: RuntimeEventPayload[] = [];

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
      secrets: { ...DEFAULT_SECRETS, openaiApiKey: "" },
      signal: new AbortController().signal,
      append: (payload) => {
        payloads.push(payload);
      },
    });

    expect(result.finishReason).toBe("error");
    const failure = payloads.find((event) => event.type === "task.failed");
    expect(failure?.type).toBe("task.failed");
    if (failure?.type === "task.failed") {
      expect(failure.recoverable).toBe(true);
      expect(failure.code).toBe("auth");
    }
  });

  test("budget stopWhen fires without isStepCount", async () => {
    const payloads: RuntimeEventPayload[] = [];

    const result = await runAgentLoop({
      taskId: "task-budget",
      messages: [
        {
          id: "user-budget",
          role: "user",
          parts: [{ type: "text", text: "Hi" }],
        },
      ],
      modelId: "openai/gpt-4o-mini",
      settings: { ...DEFAULT_SETTINGS, maxSteps: 0, maxWallClockMs: 1 },
      secrets: DEFAULT_SECRETS,
      signal: new AbortController().signal,
      modelOverride: createMockModel(),
      budgetStartedAt: Date.now() - 10_000,
      append: (payload) => {
        payloads.push(payload);
      },
    });

    expect(result.finishReason).toBe("budget");
    expect(payloads.some((event) => event.type === "budget.exceeded")).toBe(true);
  });
});
