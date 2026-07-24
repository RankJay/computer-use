import { describe, expect, test } from "bun:test";

import { MemoryAttemptEventStore } from "@/lib/attempts";
import { MemoryMandatesPersistence } from "@/lib/mandates";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { createAttemptHost } from "./attempt-host";

describe("AttemptHost stall watchdog", () => {
  test("cancels a hung streaming Attempt after stallAfterMs", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const host = createAttemptHost({
      stallAfterMs: 80,
      stallPollIntervalMs: 20,
      produceRun: async ({ append, config, signal }) => {
        append({
          type: "attempt.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({ type: "attempt.status_changed", status: "streaming" });
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
          void gate.then(() => resolve());
        });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "hang" });
    expect(started.ok).toBe(true);

    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "cancelled") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "cancelled") {
        unsub();
        resolve();
      }
    });

    expect(host.engine.getProjection().status).toBe("cancelled");
    release();
  });

  test("does not stall-cancel while waiting_interaction", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const host = createAttemptHost({
      stallAfterMs: 60,
      stallPollIntervalMs: 15,
      produceRun: async ({ append, config, signal }) => {
        append({
          type: "attempt.started",
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
        });
        append({
          type: "interaction.requested",
          callId: "c1",
          kind: "permission",
          permission: {
            capability: "delete_path",
            input: {},
            risk: "high",
          },
        });
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
          void gate.then(() => resolve());
        });
      },
      mandates: new MemoryMandatesPersistence(),
      eventStore: new MemoryAttemptEventStore(),
      loadRunContext: async () => ({
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
        persistApproval: async () => {},
      }),
    });

    const started = await host.control.start({ prompt: "wait" });
    expect(started.ok).toBe(true);

    await new Promise<void>((resolve) => {
      const unsub = host.engine.subscribe(() => {
        if (host.engine.getProjection().status === "waiting_interaction") {
          unsub();
          resolve();
        }
      });
      if (host.engine.getProjection().status === "waiting_interaction") {
        unsub();
        resolve();
      }
    });

    await new Promise((r) => setTimeout(r, 120));
    expect(host.engine.getProjection().status).toBe("waiting_interaction");

    release();
    await host.control.cancel();
  });
});
