import { describe, expect, mock, test } from "bun:test";

import type { RunAgentDeps, RunAgentResult } from "@/lib/agent/types";
import { createAutoEscalationPort } from "@/lib/session/control/escalation-port";
import type { RuntimeEventPayload } from "@/lib/session/events";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

const runAgentLoopMock = mock(async (deps: RunAgentDeps): Promise<RunAgentResult> => {
  if (deps.signal.aborted) {
    return { finishReason: "cancelled" };
  }
  deps.append({
    type: "assistant.message_started",
    messageId: "assistant-live",
    role: "assistant",
  });
  return { finishReason: "stop" };
});

mock.module("@/lib/agent/run-agent", () => ({
  runAgentLoop: runAgentLoopMock,
}));

const { createLiveRunProducer } = await import("./live-run");

describe("createLiveRunProducer", () => {
  test("emits started + running, then attempt.completed on stop", async () => {
    runAgentLoopMock.mockClear();
    const payloads: RuntimeEventPayload[] = [];
    const produce = createLiveRunProducer();

    await produce({
      config: {
        prompt: "hello live",
        modelId: "openai/gpt-4o-mini",
        settings: { ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "D:/ws" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "attempt-1",
      signal: new AbortController().signal,
      append: (payload) => payloads.push(payload),
      escalationPort: createAutoEscalationPort("allow"),
    });

    expect(payloads[0]).toMatchObject({
      type: "attempt.started",
      prompt: "hello live",
      agentMode: "live",
      userMessageId: "user-attempt-1",
    });
    expect(
      payloads.some((p) => p.type === "attempt.status_changed" && p.status === "running"),
    ).toBe(true);
    expect(payloads.some((p) => p.type === "attempt.completed" && p.finishReason === "stop")).toBe(
      true,
    );
    expect(runAgentLoopMock).toHaveBeenCalledTimes(1);
    const call = runAgentLoopMock.mock.calls[0]?.[0] as RunAgentDeps | undefined;
    const lastMessage = call?.messages[call.messages.length - 1];
    expect(lastMessage?.role).toBe("user");
    expect(lastMessage?.parts[0]).toMatchObject({ type: "text", text: "hello live" });
  });

  test("retry omits user message and still completes", async () => {
    runAgentLoopMock.mockClear();
    const payloads: RuntimeEventPayload[] = [];
    const produce = createLiveRunProducer();

    await produce({
      config: {
        prompt: "retry me",
        modelId: "openai/gpt-4o-mini",
        isRetry: true,
        chatMessages: [
          {
            id: "u1",
            role: "user",
            parts: [{ type: "text", text: "prior" }],
          },
        ],
        settings: { ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "D:/ws" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "attempt-2",
      signal: new AbortController().signal,
      append: (payload) => payloads.push(payload),
      escalationPort: createAutoEscalationPort("allow"),
    });

    expect(payloads[0]).toMatchObject({
      type: "attempt.started",
      omitUserMessage: true,
    });
    const call = runAgentLoopMock.mock.calls[0]?.[0] as RunAgentDeps | undefined;
    expect(call?.messages).toHaveLength(1);
    expect(call?.messages[0]?.id).toBe("u1");
  });

  test("budget finishReason completes as budget", async () => {
    runAgentLoopMock.mockImplementationOnce(
      async (): Promise<RunAgentResult> => ({
        finishReason: "budget",
      }),
    );
    const payloads: RuntimeEventPayload[] = [];
    const produce = createLiveRunProducer();

    await produce({
      config: {
        prompt: "budget",
        modelId: "openai/gpt-4o-mini",
        settings: { ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "D:/ws" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "attempt-3",
      signal: new AbortController().signal,
      append: (payload) => payloads.push(payload),
      escalationPort: createAutoEscalationPort("allow"),
    });

    expect(
      payloads.some((p) => p.type === "attempt.completed" && p.finishReason === "budget"),
    ).toBe(true);
  });

  test("error finishReason does not emit attempt.completed", async () => {
    runAgentLoopMock.mockImplementationOnce(
      async (): Promise<RunAgentResult> => ({
        finishReason: "error",
      }),
    );
    const payloads: RuntimeEventPayload[] = [];
    const produce = createLiveRunProducer();

    await produce({
      config: {
        prompt: "err",
        modelId: "openai/gpt-4o-mini",
        settings: { ...DEFAULT_SETTINGS, agentMode: "live", workspaceRoot: "D:/ws" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "attempt-4",
      signal: new AbortController().signal,
      append: (payload) => payloads.push(payload),
      escalationPort: createAutoEscalationPort("allow"),
    });

    expect(payloads.some((p) => p.type === "attempt.completed")).toBe(false);
  });
});
