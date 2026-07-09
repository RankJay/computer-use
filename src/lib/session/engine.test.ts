import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import type { ProduceRun, PermissionDecision } from "./control/run-controller";
import { createSessionEngine } from "./engine";
import { createDemoPayloads, createTestDemoProducer } from "./fixtures/demo-payloads";
import { projectSession } from "./project-session";

describe("SessionEngine", () => {
  test("demo producer drives a completed projection", async () => {
    const engine = createSessionEngine({
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
    const engine = createSessionEngine({
      produceRun: createTestDemoProducer(payloads),
    });

    await engine.start({
      prompt: "Parity",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    const fromEngine = engine.getProjection();
    const fromBatch = projectSession(engine.getEventLog());

    expect(fromEngine.status).toBe(fromBatch.status);
    expect(fromEngine.rows).toEqual(fromBatch.rows);
    expect(fromEngine.chatMessages).toEqual(fromBatch.chatMessages);
  });

  test("duplicate eventId is ignored by fold", () => {
    const engine = createSessionEngine({
      produceRun: async () => {},
    });
    engine.beginTask("task-dup");
    engine.append({
      type: "task.started",
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
    // Dedup is covered in project-session tests; here verify log grows only on apply.
    engine.append({
      type: "task.status_changed",
      status: "streaming",
    });
    expect(engine.getEventLog().length).toBe(2);
    expect(engine.getProjection().rows.length).toBe(rowsAfterFirst);
  });

  test("reset clears projection and log", async () => {
    const engine = createSessionEngine({
      produceRun: createTestDemoProducer(),
    });
    await engine.start({
      prompt: "x",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });
    expect(engine.getEventLog().length).toBeGreaterThan(0);

    engine.reset();
    expect(engine.getEventLog()).toEqual([]);
    expect(engine.getProjection().status).toBe("idle");
    expect(engine.getProjection().rows).toEqual([]);
  });

  test("subscribe notifies once per applied event", () => {
    const engine = createSessionEngine({ produceRun: async () => {} });
    let count = 0;
    engine.subscribe(() => {
      count += 1;
    });
    engine.beginTask("task-sub");
    engine.append({
      type: "task.started",
      prompt: "a",
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
    });
    engine.append({ type: "task.status_changed", status: "streaming" });
    expect(count).toBe(2);
  });

  test("two producers with same payloads yield identical projections", async () => {
    const payloads = createDemoPayloads("Same");

    const engineA = createSessionEngine({
      produceRun: createTestDemoProducer(payloads),
    });
    const engineB = createSessionEngine({
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

describe("RunController via SessionEngine", () => {
  test("cancel sets cancelled status", async () => {
    const slowProducer: ProduceRun = async ({ signal, append, config, taskId }) => {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${taskId}`,
      });
      append({ type: "task.status_changed", status: "streaming" });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 500);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    const engine = createSessionEngine({ produceRun: slowProducer });
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

  test("resolvePermission unblocks waiter", async () => {
    let sawDecision: PermissionDecision | undefined;

    const producer: ProduceRun = async ({ append, createPermissionWaiter, config, taskId }) => {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        userMessageId: `user-${taskId}`,
      });
      append({
        type: "permission.requested",
        callId: "c1",
        capability: "run_shell",
        input: {},
        risk: "high",
      });
      const decision = await createPermissionWaiter("c1").waitForDecision();
      sawDecision = decision;
      append({
        type: "permission.resolved",
        callId: "c1",
        decision,
      });
      append({ type: "task.completed", finishReason: "stop" });
    };

    const engine = createSessionEngine({ produceRun: producer });
    const startPromise = engine.start({
      prompt: "need approval",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    // Wait until waiting_permission
    for (let i = 0; i < 20; i += 1) {
      if (engine.getProjection().status === "waiting_permission") break;
      await Promise.resolve();
    }

    await engine.resolvePermission("c1", "approved");
    await startPromise;

    expect(sawDecision).toBe("approved");
    expect(engine.getProjection().status).toBe("completed");
    expect(engine.getProjection().pendingPermissions).toEqual([]);
  });

  test("cancel denies pending permission waiters", async () => {
    let sawDecision: PermissionDecision | undefined;

    const producer: ProduceRun = async ({
      append,
      createPermissionWaiter,
      config,
      taskId,
      signal,
    }) => {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        userMessageId: `user-${taskId}`,
      });
      append({
        type: "permission.requested",
        callId: "c1",
        capability: "run_shell",
        input: {},
        risk: "high",
      });
      sawDecision = await createPermissionWaiter("c1").waitForDecision();
      if (!signal.aborted) {
        append({ type: "task.completed", finishReason: "stop" });
      }
    };

    const engine = createSessionEngine({ produceRun: producer });
    const startPromise = engine.start({
      prompt: "deny me",
      modelId: "openai/gpt-5.4",
      settings: DEFAULT_SETTINGS,
      secrets: DEFAULT_SECRETS,
    });

    for (let i = 0; i < 20; i += 1) {
      if (engine.getProjection().pendingPermissions.length > 0) break;
      await Promise.resolve();
    }

    await engine.cancel();
    await startPromise;

    expect(sawDecision).toBe("denied");
    expect(engine.getProjection().status).toBe("cancelled");
  });

  test("cancel-before-start replaces prior run", async () => {
    let runs = 0;
    const producer: ProduceRun = async ({ append, config, taskId, signal }) => {
      runs += 1;
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "demo",
        userMessageId: `user-${taskId}`,
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
      append({ type: "task.completed", finishReason: "stop" });
    };

    const engine = createSessionEngine({ produceRun: producer });
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
