import { describe, expect, test } from "bun:test";

import { extractUsageSnapshotFromStreamChunk } from "@/agent/session/liveStreamMapping";
import {
  createLiveUsageAccumulator,
  type LiveUsageAccumulator,
} from "@/agent/session/liveUsageAccumulator";

type StreamChunkForTest = Parameters<typeof extractUsageSnapshotFromStreamChunk>[0];

const provider = "anthropic";
const modelId = "claude-sonnet-4-6";

function createAccumulator(): LiveUsageAccumulator {
  return createLiveUsageAccumulator({ provider, modelId });
}

function ingestChunk(
  accumulator: LiveUsageAccumulator,
  chunk: StreamChunkForTest,
): ReturnType<LiveUsageAccumulator["ingest"]> {
  const snapshot = extractUsageSnapshotFromStreamChunk(chunk);
  expect(snapshot).not.toBeNull();
  if (snapshot === null) {
    return null;
  }
  return accumulator.ingest(snapshot);
}

describe("liveUsageAccumulator", () => {
  test("emits deltas for raw provider and AI SDK finish snapshots", () => {
    const accumulator = createAccumulator();

    const emitted = [
      ingestChunk(accumulator, {
        type: "raw",
        rawValue: {
          type: "message_delta",
          usage: {
            input_tokens: 100,
            output_tokens: 10,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 5,
          },
        },
      }),
      ingestChunk(accumulator, {
        type: "raw",
        rawValue: {
          usage: {
            prompt_tokens: 120,
            completion_tokens: 15,
            prompt_tokens_details: {
              cached_tokens: 25,
            },
          },
        },
      }),
      ingestChunk(accumulator, {
        type: "finish-step",
        usage: {
          inputTokens: 130,
          outputTokens: 17,
          inputTokenDetails: {
            cacheReadTokens: 25,
            cacheWriteTokens: 5,
          },
        },
      }),
    ];
    accumulator.commitStep();

    const finishDelta = ingestChunk(accumulator, {
      type: "finish",
      totalUsage: {
        inputTokens: 130,
        outputTokens: 17,
        inputTokenDetails: {
          cacheReadTokens: 25,
          cacheWriteTokens: 5,
        },
      },
    });

    expect(emitted).toEqual([
      {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadInputTokens: 20,
        cacheWriteInputTokens: 5,
        costUsd: 0.00039975,
      },
      {
        inputTokens: 20,
        outputTokens: 5,
        cacheReadInputTokens: 5,
        cacheWriteInputTokens: 0,
        costUsd: 0.00012149999999999999,
      },
      {
        inputTokens: 10,
        outputTokens: 2,
        cacheReadInputTokens: 0,
        cacheWriteInputTokens: 0,
        costUsd: 0.00006,
      },
    ]);
    expect(finishDelta).toBeNull();
  });

  test("repeated identical snapshots emit no delta", () => {
    const accumulator = createAccumulator();
    const snapshot = {
      scope: "step" as const,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
      },
    };

    expect(accumulator.ingest(snapshot)).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
    expect(accumulator.ingest(snapshot)).toBeNull();
  });

  test("run-scope and step-scope snapshots converge on the same totals", () => {
    const runScoped = createAccumulator();
    const stepScoped = createAccumulator();

    runScoped.ingest({
      scope: "run",
      usage: {
        inputTokens: 30,
        outputTokens: 12,
        cacheReadInputTokens: 4,
        cacheWriteInputTokens: 2,
      },
    });
    stepScoped.ingest({
      scope: "step",
      usage: {
        inputTokens: 30,
        outputTokens: 12,
        cacheReadInputTokens: 4,
        cacheWriteInputTokens: 2,
      },
    });
    stepScoped.commitStep();

    expect(stepScoped.total()).toEqual(runScoped.total());
  });

  test("commitStep prevents a matching finish chunk from double-counting", () => {
    const accumulator = createAccumulator();

    accumulator.ingest({
      scope: "step",
      usage: {
        inputTokens: 42,
        outputTokens: 7,
      },
    });
    accumulator.commitStep();

    expect(
      accumulator.ingest({
        scope: "run",
        usage: {
          inputTokens: 42,
          outputTokens: 7,
        },
      }),
    ).toBeNull();
    expect(accumulator.total()).toEqual({
      inputTokens: 42,
      outputTokens: 7,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    });
  });
});
