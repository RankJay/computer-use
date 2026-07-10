import { describe, expect, test } from "bun:test";

import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import type { RuntimeEvent } from "../events";
import { demoRunEvents } from "../fixtures/demo-run-events";
import { projectSession } from "../project-session";
import { createEventBus } from "../transport/event-bus";
import { createDefaultRunController, createRunController } from "./run-controller";

const demoRowCount = projectSession(demoRunEvents).rows.length;

describe("run-controller", () => {
  test("demo mode replays events into a completed transcript", async () => {
    const bus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const controller = createDefaultRunController(bus, demoRunEvents);
    await controller.start({
      prompt: "Custom demo prompt",
      modelId: "openai/gpt-4o-mini",
      settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
      secrets: DEFAULT_SECRETS,
    });

    const projection = projectSession(events);

    expect(projection.status).toBe("completed");
    expect(projection.rows.length).toBe(demoRowCount);

    const userRow = projection.rows.find(
      (row) => row.type === "message" && row.scrollAnchor === true,
    );
    expect(userRow?.type).toBe("message");
    if (userRow?.type === "message") {
      expect(userRow.message.parts[0]).toEqual({
        type: "text",
        text: "Custom demo prompt",
      });
    }
  });

  test("demo mode accumulates transcript across consecutive runs", async () => {
    const bus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const controller = createDefaultRunController(bus, demoRunEvents);
    await controller.start({
      prompt: "First prompt",
      modelId: "openai/gpt-4o-mini",
      settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
      secrets: DEFAULT_SECRETS,
    });
    await controller.start({
      prompt: "Second prompt",
      modelId: "openai/gpt-4o-mini",
      settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
      secrets: DEFAULT_SECRETS,
    });

    const projection = projectSession(events);
    const userRows = projection.rows.filter(
      (row) => row.type === "message" && row.message.role === "user",
    );

    expect(userRows).toHaveLength(2);
    expect(projection.rows.length).toBeGreaterThan(demoRowCount);
  });

  test("live mode fails without API key", async () => {
    const bus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));

    const controller = createDefaultRunController(bus, demoRunEvents);
    await controller.start({
      prompt: "Hello",
      modelId: "openai/gpt-4o",
      settings: { ...DEFAULT_SETTINGS, agentMode: "live" },
      secrets: DEFAULT_SECRETS,
    });

    const projection = projectSession(events);
    expect(projection.status).toBe("failed");
    expect(projection.failure?.code).toMatch(/auth|desktop_required/);
  });

  test("cancel completes run while replay is still unwinding", async () => {
    const bus = createEventBus();
    const events: RuntimeEvent[] = [];
    bus.subscribe((event) => events.push(event));

    let replayFinished = false;

    const controller = createRunController({
      bus,
      replayDemoEvents: async (_config, _taskId, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        replayFinished = true;
      },
    });

    const startPromise = controller.start({
      prompt: "Hello",
      modelId: "openai/gpt-4o-mini",
      settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
      secrets: DEFAULT_SECRETS,
    });

    await controller.cancel();
    await startPromise;

    expect(replayFinished).toBe(true);
    expect(events.some((event) => event.type === "task.completed")).toBe(true);
  });
});
