import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import {
  buildCheckpointChat,
  checkpointErrorMessage,
  firstUserPrompt,
  isCheckpointStatus,
} from "@/features/home/hooks/use-chat-persistence";

describe("isCheckpointStatus", () => {
  test("completed and failed are checkpoints", () => {
    expect(isCheckpointStatus("completed")).toBe(true);
    expect(isCheckpointStatus("failed")).toBe(true);
  });

  test("cancelled and in-flight statuses are not", () => {
    expect(isCheckpointStatus("cancelled")).toBe(false);
    expect(isCheckpointStatus("idle")).toBe(false);
    expect(isCheckpointStatus("running")).toBe(false);
    expect(isCheckpointStatus("streaming")).toBe(false);
    expect(isCheckpointStatus("waiting_permission")).toBe(false);
  });
});

describe("firstUserPrompt", () => {
  test("joins text parts from the first user message", () => {
    const messages: UIMessage[] = [
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "text", text: "skip" }],
      },
      {
        id: "u",
        role: "user",
        parts: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      },
    ];
    expect(firstUserPrompt(messages)).toBe("hello world");
  });

  test("empty when no user message", () => {
    expect(firstUserPrompt([])).toBe("");
  });
});

describe("buildCheckpointChat", () => {
  test("uses meta when present", () => {
    const chat = buildCheckpointChat({
      id: "c1",
      mandateId: "m1",
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
      meta: { title: "Saved", modelId: "model-a", createdAt: 10, mandateId: "m1" },
      projection: { usage: { modelId: "model-b", usage: null, usedTokens: 0, maxTokens: 1 } },
      fallbackModelId: "fallback",
      now: 99,
    });
    expect(chat).toEqual({
      id: "c1",
      mandateId: "m1",
      title: "Saved",
      modelId: "model-a",
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
      createdAt: 10,
      updatedAt: 99,
    });
  });

  test("derives title and model when meta missing", () => {
    const chat = buildCheckpointChat({
      id: "c2",
      mandateId: "m2",
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "Ship it" }] }],
      meta: null,
      projection: { usage: { modelId: "model-b", usage: null, usedTokens: 0, maxTokens: 1 } },
      fallbackModelId: "fallback",
      now: 50,
    });
    expect(chat.id).toBe("c2");
    expect(chat.mandateId).toBe("m2");
    expect(chat.title.length).toBeGreaterThan(0);
    expect(chat.modelId).toBe("model-b");
    expect(chat.createdAt).toBe(50);
    expect(chat.updatedAt).toBe(50);
  });

  test("rejects aliased mandateId", () => {
    expect(() =>
      buildCheckpointChat({
        id: "same",
        mandateId: "same",
        messages: [],
        meta: null,
        projection: { usage: { modelId: null, usage: null, usedTokens: 0, maxTokens: 1 } },
        fallbackModelId: "fallback",
      }),
    ).toThrow("mandateId must not equal chat id");
  });
});

describe("checkpointErrorMessage", () => {
  test("uses Error message when present", () => {
    expect(checkpointErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  test("fallback for unknown errors", () => {
    expect(checkpointErrorMessage("nope")).toBe("Chat could not be written to this device.");
  });
});
