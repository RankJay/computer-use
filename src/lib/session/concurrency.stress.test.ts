import { describe, expect, mock, test } from "bun:test";

import { MemoryAttemptEventStore } from "@/lib/attempts";
import { MemoryMeterStore } from "@/lib/entitlements";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { createEscalationPort } from "@/lib/session/control/escalation-port";
import { createOsLease } from "@/lib/session/control/os-lease";
import type { ProduceRun } from "@/lib/session/control/run-controller";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "./attempt-host";

function yieldTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("OS lease concurrency", () => {
  test("contending acquires: at most one distinct holder at a time", async () => {
    const lease = createOsLease();
    const granted: string[] = [];
    const rejected: string[] = [];

    await Promise.all(
      Array.from({ length: 40 }, (_, i) => `a${i}`).map(async (attemptId) => {
        await yieldTurn();
        const result = lease.acquire(attemptId, "desktop");
        if (result.outcome === "granted") {
          granted.push(attemptId);
          await yieldTurn();
          expect(lease.holder()?.attemptId).toBe(attemptId);
          lease.release(attemptId);
        } else {
          rejected.push(attemptId);
        }
      }),
    );

    expect(granted.length).toBeGreaterThan(0);
    expect(granted.length + rejected.length).toBe(40);
    expect(lease.holder()).toBeNull();
  });

  test("re-entrant same attemptId: all concurrent acquires grant", async () => {
    const lease = createOsLease();
    const results = await Promise.all(
      Array.from({ length: 25 }, async () => {
        await yieldTurn();
        return lease.acquire("solo", "desktop");
      }),
    );
    expect(results.every((r) => r.outcome === "granted")).toBe(true);
    expect(lease.holder()?.attemptId).toBe("solo");
    lease.release("solo");
    expect(lease.holder()).toBeNull();
  });
});

describe("EscalationPort concurrency", () => {
  test("many parallel waits resolve independently in shuffled order", async () => {
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });

    const callIds = Array.from({ length: 12 }, (_, i) => `call-${i}`);
    const pending = callIds.map((callId) =>
      port.escalate({
        callId,
        attemptId: "attempt-1",
        capability: "delete_path",
        input: {},
        risk: "high",
      }),
    );

    await yieldTurn();

    // Resolve odd first, then even — out of start order.
    for (let i = 1; i < callIds.length; i += 2) {
      port.resolve(callIds[i]!, i % 4 === 1 ? "allow" : "deny");
    }
    for (let i = 0; i < callIds.length; i += 2) {
      port.resolve(callIds[i]!, "allow");
    }

    const outcomes = await Promise.all(pending);
    expect(outcomes).toHaveLength(12);
    expect(outcomes.every((o) => o === "allow" || o === "deny")).toBe(true);
    expect(outcomes.filter((_, i) => i % 2 === 1 && i % 4 === 3).every((o) => o === "deny")).toBe(
      true,
    );
  });

  test("denyAll settles every in-flight escalate", async () => {
    const port = createEscalationPort({
      mode: "interactive",
      notifyIfUnfocused: () => {},
    });
    const pending = Array.from({ length: 8 }, (_, i) =>
      port.escalate({
        callId: `d-${i}`,
        attemptId: "a",
        capability: "run_shell",
        input: {},
        risk: "high",
      }),
    );
    await yieldTurn();
    port.denyAll();
    const outcomes = await Promise.all(pending);
    expect(outcomes.every((o) => o === "deny")).toBe(true);
  });
});

describe("MemoryMeterStore concurrency", () => {
  test("parallel increments are not lost (RMW atomicity on event loop)", async () => {
    const meters = new MemoryMeterStore();
    const n = 200;
    await Promise.all(
      Array.from({ length: n }, async () => {
        await yieldTurn();
        await meters.increment("anonymous", "attempts", "2026-07-23", 1);
      }),
    );
    expect(await meters.get("anonymous", "attempts", "2026-07-23")).toBe(n);
  });
});

describe("AttemptHost concurrency", () => {
  test("parallel flushLedger during live run does not throw or corrupt settle", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const eventStore = new MemoryAttemptEventStore();
    const host = createAttemptHost({
      produceRun: async ({ append, config, signal }) => {
        append({
          type: "task.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        for (let i = 0; i < 20; i += 1) {
          append({ type: "task.status_changed", status: "streaming" });
          await yieldTurn();
          if (signal.aborted) return;
        }
        await gate;
        if (signal.aborted) return;
        append({ type: "task.completed", finishReason: "stop" });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "flush storm" });
    expect(started.ok).toBe(true);

    await Promise.all(Array.from({ length: 30 }, () => host.flushLedger()));
    expect(host.getLedgerError()).toBeNull();

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
    await host.flushLedger();

    if (!started.ok) return;
    const open = await eventStore.loadForMandateOpen(started.mandateId);
    expect(open?.snapshot).not.toBeNull();
    expect(host.engine.getProjection().status).toBe("completed");
  });

  test("bindChatRoute storm while live never resets the running Attempt", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const mandates = new MemoryMandatesPersistence();
    const mandateA = await mandates.create({ kind: "interactive" });
    const mandateB = await mandates.create({ kind: "interactive" });

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
        if (!signal.aborted) {
          append({ type: "task.completed", finishReason: "stop" });
        }
      },
      mandates,
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    host.control.setFocusedMandateId(mandateA.id);
    const started = await host.control.start({ prompt: "live bind" });
    expect(started.ok).toBe(true);
    expect(host.engine.getProjection().status).toBe("streaming");
    const rowsBefore = host.engine.getProjection().rows.length;

    await Promise.all([
      host.bindChatRoute({
        chatId: "chat-a",
        loadChat: async () => ({
          id: "chat-a",
          title: "A",
          modelId: "openai/gpt-5.4",
          mandateId: mandateA.id,
          createdAt: 1,
          updatedAt: 1,
        }),
      }),
      host.bindChatRoute({
        chatId: "chat-b",
        loadChat: async () => ({
          id: "chat-b",
          title: "B",
          modelId: "openai/gpt-5.4",
          mandateId: mandateB.id,
          createdAt: 1,
          updatedAt: 1,
        }),
      }),
      host.bindChatRoute({
        chatId: undefined,
        loadChat: async () => null,
      }),
      host.flushLedger(),
      host.flushLedger(),
    ]);

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

  test("overlapping starts return without hanging the control plane", async () => {
    const produceRun: ProduceRun = async ({ append, config, signal, taskId }) => {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${taskId}`,
      });
      append({ type: "task.status_changed", status: "streaming" });
      await yieldTurn();
      await yieldTurn();
      if (signal.aborted) {
        return;
      }
      append({ type: "task.completed", finishReason: "stop" });
    };

    const host = createAttemptHost({
      produceRun,
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const results = await Promise.all([
      host.control.start({ prompt: "one" }),
      host.control.start({ prompt: "two" }),
    ]);

    expect(results.some((r) => r.ok)).toBe(true);
    expect(results.every((r) => "ok" in r)).toBe(true);

    // Force quiescence — overlapping start can leave a cancelled producer without
    // a terminal fold if abort wins mid-emit; cancel is the recovery path.
    await host.control.cancel();
    for (let i = 0; i < 40; i += 1) {
      if (!host.control.getLiveIds()) break;
      await yieldTurn();
    }
    expect(host.control.getLiveIds()).toBeNull();
  });
});

describe("AttemptHost ledger error under flush pressure", () => {
  test("append failure surfaces via getLedgerError and does not crash host", async () => {
    const appendEvents = mock(async () => {
      throw new Error("disk full");
    });

    const eventStore = new MemoryAttemptEventStore();
    eventStore.appendEvents = appendEvents;

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
        if (!signal.aborted) {
          append({ type: "task.completed", finishReason: "stop" });
        }
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore,
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "err" });
    expect(started.ok).toBe(true);

    await host.flushLedger();
    expect(host.getLedgerError()).toBeInstanceOf(Error);

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
});
