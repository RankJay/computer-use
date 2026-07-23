import { describe, expect, test } from "bun:test";

import { MemoryMandatesPersistence } from "@/lib/mandates";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "../attempt-host";
import { createDemoPayloads, createTestDemoProducer } from "../fixtures/demo-payloads";

describe("AttemptControl", () => {
  test("start creates a Mandate and returns distinct attemptId", async () => {
    const mandates = new MemoryMandatesPersistence();
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("hi")),
      mandates,
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
      loadRunContext: async () => null,
    });

    const result = await host.control.start({ prompt: "x" });
    expect(result).toEqual({ ok: false, reason: "workspace_not_ready" });
  });

  test("start packs RunConfig from ExecutionContext, not raw MandateProjection dump", async () => {
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
