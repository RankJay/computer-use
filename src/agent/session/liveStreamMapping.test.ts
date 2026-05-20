import { describe, expect, test } from "bun:test";

import {
  mapAssistantTextDeltaChunk,
  mapStreamChunkToAgentEvent,
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
    const ev = mapStreamChunkToAgentEvent(
      { type: "text-delta", text: "word" },
      taskId,
      () => ({ id: "gen-1", at: 42 }),
    );

    expect(ev?.id).toBe("gen-1");
    expect(ev?.at).toBe(42);
    expect(ev?.text).toBe("word");
  });
});
