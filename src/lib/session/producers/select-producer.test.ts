import { describe, expect, mock, test } from "bun:test";

import type { ProduceRun } from "@/lib/session/control/run-controller";
import { DEFAULT_SECRETS, DEFAULT_SETTINGS } from "@/lib/settings/defaults";

const demoCalls: string[] = [];
const liveCalls: string[] = [];

mock.module("./demo-replay", () => ({
  createDemoReplayProducer: (): ProduceRun => {
    return async () => {
      demoCalls.push("demo");
    };
  },
}));

mock.module("./live-run", () => ({
  createLiveRunProducer: (): ProduceRun => {
    return async () => {
      liveCalls.push("live");
    };
  },
}));

const { createProduceRun } = await import("./select-producer");

describe("createProduceRun", () => {
  test("routes demo agentMode to demo producer", async () => {
    demoCalls.length = 0;
    liveCalls.length = 0;
    const produce = createProduceRun();
    await produce({
      config: {
        prompt: "hi",
        modelId: "openai/gpt-4o",
        settings: { ...DEFAULT_SETTINGS, agentMode: "demo" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "t1",
      signal: new AbortController().signal,
      append: () => {},
      escalationPort: {
        escalate: async () => "allow",
        resolve: () => {},
        denyAll: () => {},
      },
    });
    expect(demoCalls).toEqual(["demo"]);
    expect(liveCalls).toEqual([]);
  });

  test("routes live agentMode to live producer", async () => {
    demoCalls.length = 0;
    liveCalls.length = 0;
    const produce = createProduceRun();
    await produce({
      config: {
        prompt: "hi",
        modelId: "openai/gpt-4o",
        settings: { ...DEFAULT_SETTINGS, agentMode: "live" },
        secrets: DEFAULT_SECRETS,
      },
      attemptId: "t2",
      signal: new AbortController().signal,
      append: () => {},
      escalationPort: {
        escalate: async () => "allow",
        resolve: () => {},
        denyAll: () => {},
      },
    });
    expect(liveCalls).toEqual(["live"]);
    expect(demoCalls).toEqual([]);
  });
});
