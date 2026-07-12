import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { firstUserPrompt, isCheckpointStatus } from "@/features/home/hooks/use-chat-persistence";

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
