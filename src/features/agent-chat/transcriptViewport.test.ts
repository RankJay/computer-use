import { describe, expect, test } from "bun:test";

import type { TranscriptRenderItem } from "@/features/agent-chat/transcriptRender";
import { computeTranscriptViewport } from "@/features/agent-chat/transcriptViewport";

const user = (id: string): TranscriptRenderItem => ({
  kind: "user",
  id,
  text: "hello",
});

const assistantTurn = (id: string): TranscriptRenderItem => ({
  kind: "assistant-turn",
  id,
  parts: [{ kind: "text", text: "hi", isStreaming: false }],
  copyText: "hi",
  isStreaming: false,
});

describe("computeTranscriptViewport", () => {
  test("keeps full transcript when the run is idle", () => {
    const items = [user("u1"), assistantTurn("a1")];
    const viewport = computeTranscriptViewport(items, false);

    expect(viewport.useTurnViewport).toBe(false);
    expect(viewport.historyItems).toEqual([]);
    expect(viewport.currentTurnItems).toEqual(items);
    expect(viewport.lastUserId).toBe("u1");
    expect(viewport.lastRenderItem).toBe(items[1]);
  });

  test("pins the active turn after the latest user message", () => {
    const items = [user("u1"), assistantTurn("a1"), user("u2")];
    const viewport = computeTranscriptViewport(items, true);

    expect(viewport.useTurnViewport).toBe(true);
    expect(viewport.historyItems).toEqual([user("u1"), assistantTurn("a1")]);
    expect(viewport.currentTurnItems).toEqual([user("u2")]);
    expect(viewport.lastUserId).toBe("u2");
  });
});
