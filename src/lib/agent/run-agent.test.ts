import { describe, expect, mock, test } from "bun:test";

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import {
  createMockStreamingModel,
  errorFinishChunks,
  reasoningThenTextChunks,
  textStreamChunks,
  toolCallStreamChunks,
} from "@/lib/agent/fixtures/mock-language-model";
import { createAutoEscalationPort } from "@/lib/session/control/escalation-port";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

mock.module("@/lib/agent/capabilities/native-invoke", () => ({
  createDefaultNativeInvoker: () => {
    return async (name: string, input: unknown) => {
      if (name === "read_file") {
        return { path: (input as { path: string }).path, content: "hello", bytes: 5 };
      }
      throw { code: "unknown_capability", message: `No mock for ${name}` };
    };
  },
  createMockCapabilityInvoker: (handlers: Record<string, (input: unknown) => Promise<unknown>>) => {
    return async (name: string, input: unknown) => {
      const handler = handlers[name];
      if (!handler) throw { code: "unknown_capability", message: name };
      return handler(input);
    };
  },
  mapInvokeError: (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
      const record = error as { code: string; message: string; details?: string; cause?: string };
      return {
        code: record.code,
        message: record.message,
        details: record.details,
        cause: record.cause,
      };
    }
    return { code: "invoke_failed", message: String(error) };
  },
}));

const { runAgentLoop } = await import("./run-agent");

function baseDeps(overrides: Partial<Parameters<typeof runAgentLoop>[0]> = {}) {
  const payloads: RuntimeEventPayload[] = [];
  const deps = {
    taskId: "task-test",
    messages: [
      {
        id: "user-test",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Say hello" }],
      },
    ],
    modelId: "openai/gpt-4o-mini",
    settings: DEFAULT_SETTINGS,
    secrets: DEFAULT_SECRETS,
    signal: new AbortController().signal,
    workspaceRoot: "D:/Projects/actuate-v3",
    escalationPort: createAutoEscalationPort("allow"),
    modelOverride: createMockStreamingModel(textStreamChunks("Hello")),
    append: (payload: RuntimeEventPayload) => {
      payloads.push(payload);
    },
    ...overrides,
  };
  return { deps, payloads };
}

describe("run-agent", () => {
  test("streams assistant text and completes", async () => {
    const { deps, payloads } = baseDeps();
    const result = await runAgentLoop(deps);

    expect(result.finishReason).toBe("stop");
    expect(payloads.some((event) => event.type === "assistant.part_updated")).toBe(true);
    expect(payloads.some((event) => event.type === "task.status_changed")).toBe(true);

    const started = payloads.find((event) => event.type === "assistant.message_started");
    expect(started?.type).toBe("assistant.message_started");
    if (started?.type === "assistant.message_started") {
      expect(started.messageId).toBe("assistant-task-test");
    }
  });

  test("streams reasoning before text", async () => {
    const { deps, payloads } = baseDeps({
      modelOverride: createMockStreamingModel(reasoningThenTextChunks("think", "done")),
    });
    const result = await runAgentLoop(deps);
    expect(result.finishReason).toBe("stop");
    expect(
      payloads.some(
        (event) => event.type === "assistant.part_updated" && event.part.type === "reasoning",
      ),
    ).toBe(true);
  });

  test("auth failure emits recoverable task.failed", async () => {
    const { deps, payloads } = baseDeps({
      secrets: { ...DEFAULT_SECRETS, openaiApiKey: "" },
      modelOverride: undefined,
    });
    const result = await runAgentLoop(deps);

    expect(result.finishReason).toBe("error");
    const failure = payloads.find((event) => event.type === "task.failed");
    expect(failure?.type).toBe("task.failed");
    if (failure?.type === "task.failed") {
      expect(failure.recoverable).toBe(true);
      expect(failure.code).toBe("auth");
    }
  });

  test("budget stopWhen fires without isStepCount", async () => {
    const { deps, payloads } = baseDeps({
      settings: { ...DEFAULT_SETTINGS, maxSteps: 0, maxWallClockMs: 1 },
      budgetStartedAt: Date.now() - 10_000,
    });
    const result = await runAgentLoop(deps);

    expect(result.finishReason).toBe("budget");
    expect(payloads.some((event) => event.type === "budget.exceeded")).toBe(true);
  });

  test("already-aborted signal returns cancelled without streaming", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, payloads } = baseDeps({ signal: controller.signal });
    const result = await runAgentLoop(deps);
    expect(result.finishReason).toBe("cancelled");
    expect(payloads).toEqual([]);
  });

  test("abort mid-stream returns cancelled", async () => {
    const controller = new AbortController();
    const { deps, payloads } = baseDeps({
      signal: controller.signal,
      modelOverride: createMockStreamingModel(textStreamChunks("Hello world this is longer")),
    });

    const run = runAgentLoop(deps);
    queueMicrotask(() => controller.abort());
    const result = await run;

    expect(result.finishReason).toBe("cancelled");
    expect(payloads.some((event) => event.type === "task.failed")).toBe(false);
  });

  test("provider error finishReason emits recoverable task.failed", async () => {
    const { deps, payloads } = baseDeps({
      modelOverride: createMockStreamingModel(errorFinishChunks()),
    });
    const result = await runAgentLoop(deps);
    expect(result.finishReason).toBe("error");
    const failure = payloads.find((event) => event.type === "task.failed");
    expect(failure?.type).toBe("task.failed");
    if (failure?.type === "task.failed") {
      expect(failure.code).toBe("provider");
      expect(failure.recoverable).toBe(true);
    }
  });

  test("tool-call stream invokes capability then follows up with text", async () => {
    let streamCalls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        streamCalls += 1;
        if (streamCalls === 1) {
          return {
            stream: simulateReadableStream({
              chunks: toolCallStreamChunks({
                toolCallId: "call-read",
                toolName: "read_file",
                argsJson: JSON.stringify({ path: "src/main.tsx" }),
              }),
            }),
          };
        }
        return {
          stream: simulateReadableStream({
            chunks: textStreamChunks("Read complete"),
          }),
        };
      },
    });

    const { deps, payloads } = baseDeps({
      taskId: "task-tool",
      modelOverride: model,
      settings: { ...DEFAULT_SETTINGS, permissionMode: "risky", maxSteps: 5 },
    });

    const result = await runAgentLoop(deps);
    expect(result.finishReason).toBe("stop");
    expect(streamCalls).toBeGreaterThanOrEqual(2);
    expect(payloads.some((event) => event.type === "capability.requested")).toBe(true);
    expect(payloads.some((event) => event.type === "capability.completed")).toBe(true);
  });
});
