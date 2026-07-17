import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { partDirtyKey, syncAssistantMessage, type MessageSyncState } from "./ui-stream-sync";

describe("partDirtyKey", () => {
  test("text parts key on state + text without full JSON shape noise", () => {
    const a = partDirtyKey({ type: "text", text: "hi", state: "streaming" });
    const b = partDirtyKey({ type: "text", text: "hi", state: "streaming" });
    const c = partDirtyKey({ type: "text", text: "hi!", state: "streaming" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test("reasoning parts key on state + text", () => {
    const a = partDirtyKey({ type: "reasoning", text: "think", state: "streaming" });
    const b = partDirtyKey({ type: "reasoning", text: "think", state: "done" });
    expect(a).not.toBe(b);
  });
});

describe("syncAssistantMessage", () => {
  test("emits started then part_updated only when dirty key changes", () => {
    const payloads: { type: string; partIndex?: number }[] = [];
    const emit = (payload: { type: string; partIndex?: number }) => {
      payloads.push(payload);
    };

    const message: UIMessage = {
      id: "asst-1",
      role: "assistant",
      parts: [{ type: "text", text: "Hel", state: "streaming" }],
    };

    let state: MessageSyncState | null = null;
    state = syncAssistantMessage(emit, message, state);
    expect(payloads.map((p) => p.type)).toEqual([
      "assistant.message_started",
      "assistant.part_updated",
    ]);

    payloads.length = 0;
    const sameRef = syncAssistantMessage(emit, message, state);
    expect(sameRef).toBe(state);
    expect(payloads).toEqual([]);

    message.parts = [{ type: "text", text: "Hello", state: "streaming" }];
    state = syncAssistantMessage(emit, message, state);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.type).toBe("assistant.part_updated");
    expect(payloads[0]).toMatchObject({ partIndex: 0 });
  });
});
