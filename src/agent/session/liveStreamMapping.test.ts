import { describe, expect, test } from "bun:test";

import {
  addUsageSnapshots,
  createEmptyUsageSnapshot,
  extractUsageSnapshotFromStreamChunk,
  mapAssistantTextDeltaChunk,
  mapStreamChunkToAgentEvent,
  mapUsageDeltaToAgentEvent,
  mergeUsageSnapshot,
  usageSnapshotDelta,
} from "@/agent/session/liveStreamMapping";

const taskId = "task-1";

describe("liveStreamMapping", () => {
  test("text deltas produce assistant.text.delta events", () => {
    const ev = mapAssistantTextDeltaChunk(
      { type: "text-delta", text: "Hello" },
      taskId,
      "delta-1",
      1000,
    );

    expect(ev).toEqual({
      id: "delta-1",
      at: 1000,
      taskId,
      type: "assistant.text.delta",
      text: "Hello",
    });
  });

  test("mapStreamChunkToAgentEvent ignores non text-delta chunks", () => {
    expect(
      mapStreamChunkToAgentEvent({ type: "tool-call" }, taskId, () => ({
        id: "x",
        at: 1,
      })),
    ).toBeNull();
    expect(
      mapStreamChunkToAgentEvent({ type: "text-delta" }, taskId, () => ({
        id: "x",
        at: 1,
      })),
    ).toBeNull();
  });

  test("mapStreamChunkToAgentEvent uses createEventMeta for ids", () => {
    const ev = mapStreamChunkToAgentEvent({ type: "text-delta", text: "word" }, taskId, () => ({
      id: "gen-1",
      at: 42,
    }));

    expect(ev?.id).toBe("gen-1");
    expect(ev?.at).toBe(42);
    expect(ev?.text).toBe("word");
  });

  test("extracts Anthropic raw usage snapshots", () => {
    expect(
      extractUsageSnapshotFromStreamChunk({
        type: "raw",
        rawValue: {
          type: "message_delta",
          usage: {
            input_tokens: 100,
            output_tokens: 25,
            cache_read_input_tokens: 40,
            cache_creation_input_tokens: 10,
          },
        },
      }),
    ).toEqual({
      scope: "step",
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadInputTokens: 40,
        cacheWriteInputTokens: 10,
      },
    });
  });

  test("extracts AI SDK final usage snapshots", () => {
    expect(
      extractUsageSnapshotFromStreamChunk({
        type: "finish",
        totalUsage: {
          inputTokens: 100,
          outputTokens: 20,
          inputTokenDetails: {
            cacheReadTokens: 30,
            cacheWriteTokens: 0,
          },
        },
      }),
    ).toEqual({
      scope: "run",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadInputTokens: 30,
        cacheWriteInputTokens: 0,
      },
    });
  });

  test("maps usage snapshot deltas into priced usage events", () => {
    const committed = createEmptyUsageSnapshot();
    const previousLive = createEmptyUsageSnapshot();
    const currentStep = mergeUsageSnapshot(createEmptyUsageSnapshot(), {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadInputTokens: 400,
      cacheWriteInputTokens: 100,
    });
    const live = addUsageSnapshots(committed, currentStep);
    const delta = usageSnapshotDelta(live, previousLive);

    const ev = mapUsageDeltaToAgentEvent(delta, taskId, "anthropic", "claude-sonnet-4-6", () => ({
      id: "usage-1",
      at: 42,
    }));

    expect(ev?.id).toBe("usage-1");
    expect(ev?.at).toBe(42);
    expect(ev?.taskId).toBe(taskId);
    expect(ev?.type).toBe("usage.delta");
    expect(ev?.delta.inputTokens).toBe(1000);
    expect(ev?.delta.outputTokens).toBe(200);
    expect(ev?.delta.cacheReadInputTokens).toBe(400);
    expect(ev?.delta.cacheWriteInputTokens).toBe(100);
    expect(ev?.delta.costUsd).toBeCloseTo(0.004995);
  });
});
