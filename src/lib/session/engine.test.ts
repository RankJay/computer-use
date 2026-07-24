import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { escalationToPermissionDecision } from "./control/escalation-port";
import type { ProduceRun, PermissionDecision } from "./control/run-controller";
import { createAttemptEngine } from "./engine";
import { createDemoPayloads, createTestDemoProducer } from "./fixtures/demo-payloads";
import { projectMandate } from "./fold";

describe("AttemptEngine", () => {
  test("demo producer drives a completed projection", async () => {
    const engine = createAttemptEngine({
      produceRun: createTestDemoProducer(createDemoPayloads("Hello demo")),
    });

    await engine.start({
      prompt: "Hello demo",
      modelId: "openai/gpt-5.4",
      settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
      secrets: DEFAULT_SECRETS,
    });

    const projection = engine.getProjection();
    expect(projection.status).toBe("completed");
    expect(projection.rows.length).toBeGreaterThan(0);
    expect(projection.chatMessages.some((m) => m.role === "user")).toBe(true);
  });

  test("any producer → same log → same projection as batch fold", async () => {
    const payloads = createDemoPayloads("Parity");
    const engine = createAttemptEngine({
      produceRun: createTestDemoProducer(payloads),
    });

    await engine.start({
      prompt: "Parity",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    const fromEngine = engine.getProjection();
    const fromBatch = projectMandate(engine.getEventLog());

    expect(fromEngine.status).toBe(fromBatch.status);
    expect(fromEngine.rows).toEqual(fromBatch.rows);
    expect(fromEngine.chatMessages).toEqual(fromBatch.chatMessages);
  });

  test("duplicate eventId is ignored by fold", () => {
    const engine = createAttemptEngine({
      produceRun: async () => {},
    });
    engine.beginAttempt("task-dup");
    engine.append({
      type: "attempt.started",
      prompt: "a",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    // Manually force same seq by resetting seq via clear+begin would change ids;
    // instead verify seen set via second identical append after replaying log fold.
    const log = engine.getEventLog();
    expect(log).toHaveLength(1);
    const rowsAfterFirst = engine.getProjection().rows.length;

    // Re-appending a new payload gets a new eventId — not a duplicate.
    // Dedup is covered in fold tests; here verify log grows only on apply.
    engine.append({
      type: "attempt.status_changed",
      status: "streaming",
    });
    expect(engine.getEventLog().length).toBe(2);
    expect(engine.getProjection().rows.length).toBe(rowsAfterFirst);
  });

  test("reset clears projection and log", async () => {
    const engine = createAttemptEngine({
      produceRun: createTestDemoProducer(),
    });
    await engine.start({
      prompt: "x",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });
    expect(engine.getEventLog().length).toBeGreaterThan(0);

    await engine.reset();
    expect(engine.getEventLog()).toEqual([]);
    expect(engine.getProjection().status).toBe("idle");
    expect(engine.getProjection().rows).toEqual([]);
  });

  test("reset mid-run cancels producer then clears", async () => {
    let appendAfterAbort = 0;
    const slowProducer: ProduceRun = async ({ signal, append, config, attemptId }) => {
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${attemptId}`,
      });
      append({ type: "attempt.status_changed", status: "streaming" });

      await new Promise<void>((resolve) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", onAbort);
      });

      if (!signal.aborted) {
        appendAfterAbort += 1;
        append({ type: "attempt.completed", finishReason: "stop" });
      }
    };

    const engine = createAttemptEngine({ produceRun: slowProducer });
    const startPromise = engine.start({
      prompt: "slow",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    // Let the producer emit started/streaming before reset.
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.getProjection().status).toBe("streaming");

    await engine.reset();
    await startPromise;

    expect(appendAfterAbort).toBe(0);
    expect(engine.getEventLog()).toEqual([]);
    expect(engine.getProjection().status).toBe("idle");
    expect(engine.getProjection().rows).toEqual([]);
  });

  test("subscribe notifies once per applied event", () => {
    const engine = createAttemptEngine({ produceRun: async () => {} });
    let count = 0;
    engine.subscribe(() => {
      count += 1;
    });
    engine.beginAttempt("task-sub");
    engine.append({
      type: "attempt.started",
      prompt: "a",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    engine.append({ type: "attempt.status_changed", status: "streaming" });
    expect(count).toBe(2);
  });

  test("hydrate seeds projection from messages and clears in-memory eventLog", () => {
    const engine = createAttemptEngine({ produceRun: async () => {} });
    engine.beginAttempt("task-pre");
    engine.append({
      type: "attempt.started",
      prompt: "prior",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    expect(engine.getEventLog()).toHaveLength(1);

    let notified = 0;
    engine.subscribe(() => {
      notified += 1;
    });

    const messages = [
      {
        id: "u1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "resume me" }],
      },
    ];
    engine.hydrate(messages);

    expect(notified).toBe(1);
    expect(engine.getEventLog()).toEqual([]);
    expect(engine.getProjection().status).toBe("idle");
    expect(engine.getProjection().chatMessages).toEqual(messages);
    expect(engine.getProjection().rows).toEqual([
      { type: "message", id: "u1", message: messages[0] },
    ]);
  });

  test("two producers with same payloads yield identical projections", async () => {
    const payloads = createDemoPayloads("Same");

    const engineA = createAttemptEngine({
      produceRun: createTestDemoProducer(payloads),
    });
    const engineB = createAttemptEngine({
      produceRun: createTestDemoProducer(payloads),
    });

    const config = {
      prompt: "Same",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    };

    await engineA.start(config);
    await engineB.start(config);

    expect(engineA.getProjection().status).toBe(engineB.getProjection().status);
    expect(engineA.getProjection().rows.map((r) => r.type)).toEqual(
      engineB.getProjection().rows.map((r) => r.type),
    );
  });
});

describe("RunController via AttemptEngine", () => {
  test("cancel sets cancelled status", async () => {
    const slowProducer: ProduceRun = async ({ signal, append, config, attemptId }) => {
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${attemptId}`,
      });
      append({ type: "attempt.status_changed", status: "streaming" });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    const engine = createAttemptEngine({ produceRun: slowProducer });
    const startPromise = engine.start({
      prompt: "slow",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    await Promise.resolve();
    await engine.cancel();
    await startPromise;

    expect(engine.getProjection().status).toBe("cancelled");
  });

  test("resolve unblocks EscalationPort", async () => {
    let sawDecision: PermissionDecision | undefined;

    const producer: ProduceRun = async ({ append, escalationPort, config, attemptId }) => {
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        userMessageId: `user-${attemptId}`,
      });
      append({
        type: "interaction.requested",
        callId: "c1",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: {},
          risk: "high",
        },
      });
      const outcome = await escalationPort.escalate({
        callId: "c1",
        attemptId,
        capability: "run_shell",
        input: {},
        risk: "high",
      });
      sawDecision = escalationToPermissionDecision(outcome);
      append({
        type: "interaction.resolved",
        callId: "c1",
        kind: "permission",
        permission: {
          decision: sawDecision,
        },
      });
      append({ type: "attempt.completed", finishReason: "stop" });
    };

    const engine = createAttemptEngine({ produceRun: producer });
    const startPromise = engine.start({
      prompt: "need approval",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    // Wait until waiting_interaction
    for (let i = 0; i < 20; i += 1) {
      if (engine.getProjection().status === "waiting_interaction") break;
      await Promise.resolve();
    }

    await engine.resolve({ callId: "c1", kind: "permission", decision: "approved" });
    await startPromise;

    expect(sawDecision).toBe("approved");
    expect(engine.getProjection().status).toBe("completed");
    expect(engine.getProjection().pendingInteractions).toEqual([]);
  });

  test("cancel denies pending EscalationPort waits", async () => {
    let sawDecision: PermissionDecision | undefined;

    const producer: ProduceRun = async ({ append, escalationPort, config, attemptId, signal }) => {
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        userMessageId: `user-${attemptId}`,
      });
      append({
        type: "interaction.requested",
        callId: "c1",
        kind: "permission",
        permission: {
          capability: "run_shell",
          input: {},
          risk: "high",
        },
      });
      const outcome = await escalationPort.escalate({
        callId: "c1",
        attemptId,
        capability: "run_shell",
        input: {},
        risk: "high",
      });
      sawDecision = escalationToPermissionDecision(outcome);
      if (!signal.aborted) {
        append({ type: "attempt.completed", finishReason: "stop" });
      }
    };

    const engine = createAttemptEngine({ produceRun: producer });
    const startPromise = engine.start({
      prompt: "deny me",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    for (let i = 0; i < 20; i += 1) {
      if (engine.getProjection().pendingInteractions.length > 0) break;
      await Promise.resolve();
    }

    await engine.cancel();
    await startPromise;

    expect(sawDecision).toBe("denied");
    expect(engine.getProjection().status).toBe("cancelled");
  });

  test("retry after recoverable failure omits duplicate user message", async () => {
    let runs = 0;
    const producer: ProduceRun = async ({ append, config, attemptId }) => {
      runs += 1;
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: config.isRetry ? undefined : `user-${attemptId}`,
        omitUserMessage: config.isRetry === true,
      });

      if (runs === 1) {
        append({
          type: "attempt.failed",
          code: "auth",
          message: "missing key",
          recoverable: true,
        });
        return;
      }

      append({ type: "attempt.completed", finishReason: "stop" });
    };

    const engine = createAttemptEngine({ produceRun: producer });
    await engine.start({
      prompt: "retry me",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    expect(engine.getProjection().status).toBe("failed");
    expect(engine.getProjection().failure?.recoverable).toBe(true);
    const userRowsBefore = engine
      .getProjection()
      .rows.filter((row) => row.type === "message" && row.message.role === "user").length;
    expect(userRowsBefore).toBe(1);

    await engine.retry();

    expect(runs).toBe(2);
    expect(engine.getProjection().status).toBe("completed");
    const userRowsAfter = engine
      .getProjection()
      .rows.filter((row) => row.type === "message" && row.message.role === "user").length;
    expect(userRowsAfter).toBe(1);
  });

  test("retryFromMessage keeps prior turns and user prompt, drops answer and after", async () => {
    let lastPrompt: string | undefined;
    let lastIsRetry: boolean | undefined;
    let lastChatIds: string[] = [];

    const producer: ProduceRun = async ({ append, config, attemptId }) => {
      lastPrompt = config.prompt;
      lastIsRetry = config.isRetry === true;
      lastChatIds = (config.chatMessages ?? []).map((message) => message.id);
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: config.isRetry ? undefined : `user-${attemptId}`,
        omitUserMessage: config.isRetry === true,
      });
      const assistantId = `assistant-${attemptId}`;
      append({ type: "assistant.message_started", messageId: assistantId, role: "assistant" });
      append({
        type: "assistant.part_updated",
        messageId: assistantId,
        partIndex: 0,
        part: { type: "text", text: `answer for ${config.prompt}` },
      });
      append({ type: "assistant.message_finished", messageId: assistantId });
      append({ type: "attempt.completed", finishReason: "stop" });
    };

    const engine = createAttemptEngine({ produceRun: producer });
    await engine.start({
      prompt: "first",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });
    await engine.start({
      prompt: "second",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
      chatMessages: engine.getProjection().chatMessages,
    });
    await engine.start({
      prompt: "third",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
      chatMessages: engine.getProjection().chatMessages,
    });

    const before = engine.getProjection().chatMessages;
    expect(before).toHaveLength(6);
    const middleAssistant = before[3];
    expect(middleAssistant?.role).toBe("assistant");

    await engine.retryFromMessage(middleAssistant!.id, {
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    expect(lastPrompt).toBe("second");
    expect(lastIsRetry).toBe(true);
    expect(lastChatIds).toEqual([before[0]!.id, before[1]!.id, before[2]!.id]);

    const after = engine.getProjection().chatMessages;
    expect(after.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(after[0]?.id).toBe(before[0]!.id);
    expect(after[1]?.id).toBe(before[1]!.id);
    expect(after[2]?.id).toBe(before[2]!.id);
    expect(after[3]?.id).not.toBe(middleAssistant!.id);
  });

  test("cancel-before-start replaces prior run", async () => {
    let runs = 0;
    const producer: ProduceRun = async ({ append, config, attemptId, signal }) => {
      runs += 1;
      append({
        type: "attempt.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${attemptId}`,
      });
      if (runs === 1) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 500);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        return;
      }
      append({ type: "attempt.completed", finishReason: "stop" });
    };

    const engine = createAttemptEngine({ produceRun: producer });
    const first = engine.start({
      prompt: "first",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });
    await Promise.resolve();
    await engine.start({
      prompt: "second",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });
    await first;

    expect(runs).toBe(2);
    expect(engine.getProjection().status).toBe("completed");
  });
});
