import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { planRegenerateFromAssistant, textPartsMarkdown } from "./regenerate-from-message";

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, text: string): UIMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

describe("textPartsMarkdown", () => {
  test("joins text parts and skips non-text", () => {
    const message: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "Hello" },
        { type: "reasoning", text: "think", state: "done" },
        { type: "text", text: "World" },
      ],
    };
    expect(textPartsMarkdown(message)).toBe("Hello\n\nWorld");
  });
});

describe("planRegenerateFromAssistant", () => {
  const messages = [
    user("u0", "first"),
    assistant("a0", "reply0"),
    user("u1", "second"),
    assistant("a1", "reply1"),
    user("u2", "third"),
    assistant("a2", "reply2"),
  ];

  test("keeps prior turns and user prompt; drops clicked answer and after", () => {
    const plan = planRegenerateFromAssistant(messages, "a1");
    expect(plan).not.toBeNull();
    expect(plan?.prompt).toBe("second");
    expect(plan?.messages.map((m) => m.id)).toEqual(["u0", "a0", "u1"]);
  });

  test("last answer drops only itself", () => {
    const plan = planRegenerateFromAssistant(messages, "a2");
    expect(plan?.prompt).toBe("third");
    expect(plan?.messages.map((m) => m.id)).toEqual(["u0", "a0", "u1", "a1", "u2"]);
  });

  test("returns null for unknown or non-assistant id", () => {
    expect(planRegenerateFromAssistant(messages, "missing")).toBeNull();
    expect(planRegenerateFromAssistant(messages, "u1")).toBeNull();
  });
});
