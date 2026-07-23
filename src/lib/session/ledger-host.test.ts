import { describe, expect, test } from "bun:test";

import { MemoryAttemptEventStore } from "@/lib/attempts";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "./attempt-host";
import { createDemoPayloads, createTestDemoProducer } from "./fixtures/demo-payloads";
import { projectSession } from "./project-session";

async function waitForStatus(
  host: ReturnType<typeof createAttemptHost>,
  status: "completed" | "failed" | "cancelled",
): Promise<void> {
  await new Promise<void>((resolve) => {
    const unsub = host.engine.subscribe(() => {
      if (host.engine.getProjection().status === status) {
        unsub();
        resolve();
      }
    });
    if (host.engine.getProjection().status === status) {
      unsub();
      resolve();
    }
  });
  await host.flushLedger();
}

describe("AttemptHost durable ledger", () => {
  test("settle writes snapshot; reopen hydrates without messages_json", async () => {
    const mandates = new MemoryMandatesPersistence();
    const eventStore = new MemoryAttemptEventStore();
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("ledger hi")),
      mandates,
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "ledger hi" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await waitForStatus(host, "completed");

    const open = await eventStore.loadForMandateOpen(started.mandateId);
    expect(open?.snapshot).not.toBeNull();
    expect(open?.snapshot?.chatMessages.some((m) => m.role === "user")).toBe(true);

    const host2 = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates,
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    await host2.bindChatRoute({
      chatId: "chat-ledger",
      loadChat: async () => ({
        id: "chat-ledger",
        title: "T",
        modelId: "openai/gpt-5.4",
        mandateId: started.mandateId,
        messages: [], // empty Client checkpoint — ledger is truth
        createdAt: 1,
        updatedAt: 1,
      }),
      ensureMandateForChat: async (chat) => chat,
    });

    expect(host2.engine.getProjection().chatMessages.some((m) => m.role === "user")).toBe(true);
    expect(host2.engine.getProjection().status).toBe("completed");
  });

  test("snapshot + empty tail fold matches full event replay for settled attempt", async () => {
    const eventStore = new MemoryAttemptEventStore();
    const mandates = new MemoryMandatesPersistence();
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("parity")),
      mandates,
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "parity" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await waitForStatus(host, "completed");
    const liveProjection = host.engine.getProjection();

    const open = await eventStore.loadForMandateOpen(started.mandateId);
    expect(open?.snapshot).not.toBeNull();

    // With settle covering all seqs, open path is snapshot-only (no tail).
    host.engine.hydrateFromLedger({
      snapshot: open?.snapshot ?? null,
      events: open?.events ?? [],
    });
    expect(host.engine.getProjection().chatMessages).toEqual(liveProjection.chatMessages);
    expect(host.engine.getProjection().status).toBe(liveProjection.status);
  });

  test("mid-run flush keeps events for unsettled recovery", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const eventStore = new MemoryAttemptEventStore();
    const mandates = new MemoryMandatesPersistence();

    const host = createAttemptHost({
      produceRun: async ({ append, config }) => {
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "task.status_changed", status: "streaming" });
        append({
          type: "assistant.message_started",
          messageId: "a1",
          role: "assistant",
        });
        append({
          type: "assistant.part_updated",
          messageId: "a1",
          partIndex: 0,
          part: { type: "text", text: "partial" },
        });
        await gate;
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates,
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "partial" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await host.flushLedger();
    const mid = await eventStore.loadForMandateOpen(started.mandateId);
    expect(mid?.events.length).toBeGreaterThan(0);

    // Simulate crash: new host, reopen from ledger (no snapshot yet).
    const host2 = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates,
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });
    await host2.bindChatRoute({
      chatId: "c",
      loadChat: async () => ({
        id: "c",
        title: "T",
        modelId: "m",
        mandateId: started.mandateId,
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      }),
      ensureMandateForChat: async (chat) => chat,
    });

    expect(
      host2.engine
        .getProjection()
        .chatMessages.some((m) => m.parts.some((p) => p.type === "text" && p.text === "partial")),
    ).toBe(true);
    // Unrecovered mid-run hydrate must not look live (no runner to cancel/resolve).
    expect(host2.engine.getProjection().status).toBe("cancelled");
    const mandate = await mandates.get(started.mandateId);
    expect(mandate?.status).toBe("armed");

    // Leave host1 gated — do not let it overwrite Mandate lifecycle after crash-open settle.
    void releaseGate;
  });

  test("Mandate lifecycle leaves running after settle so triggers can wake again", async () => {
    const mandates = new MemoryMandatesPersistence();
    const host = createAttemptHost({
      produceRun: createTestDemoProducer(createDemoPayloads("life")),
      mandates,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "life" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    expect((await mandates.get(started.mandateId))?.status).toBe("running");
    await waitForStatus(host, "completed");
    await host.flushLedger();
    for (let i = 0; i < 30; i += 1) {
      if ((await mandates.get(started.mandateId))?.status === "done") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect((await mandates.get(started.mandateId))?.status).toBe("done");
  });
});

describe("hydrateFromLedger vs full replay", () => {
  test("engine ledger hydrate equals projectSession for event-only open", async () => {
    const store = new MemoryAttemptEventStore();
    const attemptId = "att-x";
    const mandateId = "man-x";
    const events = [
      {
        type: "task.started" as const,
        eventId: "1",
        taskId: attemptId,
        timestamp: 1,
        schemaVersion: 1,
        prompt: "p",
        modelId: "m",
        agentMode: "demo" as const,
      },
      {
        type: "assistant.message_started" as const,
        eventId: "2",
        taskId: attemptId,
        timestamp: 2,
        schemaVersion: 1,
        messageId: "a",
        role: "assistant" as const,
      },
      {
        type: "assistant.part_updated" as const,
        eventId: "3",
        taskId: attemptId,
        timestamp: 3,
        schemaVersion: 1,
        messageId: "a",
        partIndex: 0,
        part: { type: "text" as const, text: "ok" },
      },
      {
        type: "task.completed" as const,
        eventId: "4",
        taskId: attemptId,
        timestamp: 4,
        schemaVersion: 1,
        finishReason: "stop" as const,
      },
    ];
    await store.appendEvents({ attemptId, mandateId, events });

    const open = await store.loadForMandateOpen(mandateId);
    const fromReplay = projectSession(open?.events ?? []);

    const host = createAttemptHost({
      produceRun: createTestDemoProducer(),
      mandates: new MemoryMandatesPersistence(),
      eventStore: store,
      loadRunContext: async () => null,
    });
    host.engine.hydrateFromLedger({ snapshot: null, events: open?.events ?? [] });
    expect(host.engine.getProjection().chatMessages).toEqual(fromReplay.chatMessages);
    expect(host.engine.getProjection().status).toBe(fromReplay.status);
  });
});
