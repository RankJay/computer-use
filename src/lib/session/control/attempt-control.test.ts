import { describe, expect, test } from "bun:test";

import { MemoryAttemptEventStore } from "@/lib/attempts";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "../attempt-host";
import { createDemoPayloads, createTestDemoProducer } from "../fixtures/demo-payloads";
import { rejectIfBusyConcurrencyPolicy } from "./concurrency-policy";

describe("AttemptControl", () => {
  test("start creates a Mandate and returns distinct attemptId", async () => {
    const mandates = new MemoryMandatesPersistence();
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("hi")),
      mandates,
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const result = await host.control.start({ prompt: "hi" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mandateId.length).toBeGreaterThan(0);
    expect(result.attemptId.length).toBeGreaterThan(0);
    expect(result.mandateId).not.toBe(result.attemptId);

    const mandate = await mandates.get(result.mandateId);
    expect(mandate?.kind).toBe("interactive");

    // Wait for demo settle.
    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });
  });

  test("start reuses focused Mandate instead of minting another", async () => {
    const mandates = new MemoryMandatesPersistence();
    const existing = await mandates.create({ kind: "interactive" });
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates,
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });
    host.control.setFocusedMandateId(existing.id);

    const result = await host.control.start({ prompt: "again" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mandateId).toBe(existing.id);
  });

  test("workspace_not_ready when loadRunContext returns null", async () => {
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => null,
    });

    const result = await host.control.start({ prompt: "x" });
    expect(result).toEqual({ ok: false, reason: "workspace_not_ready" });
  });

  test("start packs RunConfig from ModelContext, not raw MandateProjection dump", async () => {
    const huge = "z".repeat(8_000);
    let packedOutput: unknown;
    const host = createAttemptHost({
      produceRun: async ({ config, append }) => {
        const assistant = config.chatMessages?.find((m) => m.role === "assistant");
        const part = assistant?.parts[0];
        packedOutput = part && "output" in part ? part.output : undefined;
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    host.engine.hydrate([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "read_file",
            toolCallId: "c1",
            state: "output-available",
            input: { path: "/tmp/a" },
            output: { content: huge },
          },
        ],
      },
    ]);

    const auditBefore = host.getMandateProjection().chatMessages[0]?.parts[0];
    expect(auditBefore && "output" in auditBefore ? auditBefore.output : null).toEqual({
      content: huge,
    });

    const result = await host.control.start({ prompt: "next" });
    expect(result.ok).toBe(true);
    expect(typeof packedOutput).toBe("string");
    expect(String(packedOutput).length).toBeLessThan(huge.length);
  });

  test("retry workspace_not_ready when loadRunContext returns null", async () => {
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => null,
    });
    expect(await host.control.retry()).toEqual({ ok: false, reason: "workspace_not_ready" });
  });

  test("retry reuses focused mandate after a prior start", async () => {
    const mandates = new MemoryMandatesPersistence();
    const mandate = await mandates.create({ kind: "interactive" });
    let runs = 0;
    const host = createAttemptHost({
      produceRun: async ({ append, config, taskId }) => {
        runs += 1;
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
          userMessageId: config.isRetry ? undefined : `user-${taskId}`,
          omitUserMessage: config.isRetry === true,
        });
        if (runs === 1) {
          append({
            type: "task.failed",
            code: "auth",
            message: "missing key",
            recoverable: true,
          });
          return;
        }
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates,
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });
    host.control.setFocusedMandateId(mandate.id);

    const first = await host.control.start({ prompt: "fail once" });
    expect(first.ok).toBe(true);
    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "failed") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "failed") {
        unsub();
        resolve();
      }
    });

    const result = await host.control.retry();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mandateId).toBe(mandate.id);

    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });
    expect(runs).toBe(2);
  });

  test("rejectIfBusy policy rejects start while another Attempt is live", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const host = createAttemptHost({
      produceRun: async ({ append, config, signal }) => {
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "task.status_changed", status: "streaming" });
        await gate;
        if (signal.aborted) return;
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    host.registry.setConcurrencyPolicy(rejectIfBusyConcurrencyPolicy);

    const first = await host.control.start({ prompt: "hold" });
    expect(first.ok).toBe(true);
    expect(host.control.getLiveIds()).not.toBeNull();

    const second = await host.control.start({ prompt: "blocked" });
    expect(second).toMatchObject({ ok: false, reason: "concurrency_reject" });

    releaseGate();
    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });
  });

  test("cancel_previous policy still replaces a live Attempt", async () => {
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let runs = 0;

    const host = createAttemptHost({
      produceRun: async ({ append, config, signal }) => {
        runs += 1;
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "task.status_changed", status: "streaming" });
        if (runs === 1) {
          await firstGate;
        }
        if (signal.aborted) return;
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const first = await host.control.start({ prompt: "one" });
    expect(first.ok).toBe(true);

    const second = await host.control.start({ prompt: "two" });
    expect(second.ok).toBe(true);
    if (second.ok && first.ok) {
      expect(second.attemptId).not.toBe(first.attemptId);
    }

    releaseFirst();
    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "completed") {
        unsub();
        resolve();
      }
    });
    expect(runs).toBe(2);
  });
});

describe("AttemptHost.bindChatRoute", () => {
  test("does not reset while Attempt is live", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const host = createAttemptHost({
      produceRun: async ({ append, config, signal }) => {
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "task.status_changed", status: "streaming" });
        await gate;
        if (signal.aborted) return;
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    await host.control.start({ prompt: "live" });
    expect(host.engine.getProjection().status).toBe("streaming");

    const rowsBefore = host.engine.getProjection().rows.length;
    await host.bindChatRoute({
      chatId: undefined,
      loadChat: async () => null,
    });

    expect(host.engine.getProjection().status).toBe("streaming");
    expect(host.engine.getProjection().rows.length).toBe(rowsBefore);

    releaseGate();
    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "completed") {
          unsub();
          resolve();
        }
      });
    });
  });

  test("idle bind focuses mandate; empty projection without ledger", async () => {
    const mandates = new MemoryMandatesPersistence();
    const mandate = await mandates.create({ kind: "interactive" });
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates,
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    await host.bindChatRoute({
      chatId: "chat-1",
      loadChat: async () => ({
        id: "chat-1",
        title: "T",
        modelId: "openai/gpt-5.4",
        mandateId: mandate.id,
        createdAt: 1,
        updatedAt: 1,
      }),
    });

    expect(host.control.getFocusedMandateId()).toBe(mandate.id);
    expect(host.control.getLiveChatId()).toBe("chat-1");
    expect(host.engine.getProjection().chatMessages).toEqual([]);
    expect(host.engine.getProjection().status).toBe("idle");
  });
});
