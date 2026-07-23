import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import {
  DEFAULT_EXECUTION_CONTEXT_OPTIONS,
  PASSTHROUGH_EXECUTION_CONTEXT_OPTIONS,
  foldExecutionContext,
} from "./execution-context";
import { createEmptyMandateProjection } from "./projection";

function userText(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("foldExecutionContext", () => {
  test("passthrough keeps audit chatMessages identity when nothing to compact", () => {
    const chatMessages = [userText("u1", "hello"), userText("u2", "world")];
    const projection = { ...createEmptyMandateProjection(), chatMessages };
    const execution = foldExecutionContext(projection, PASSTHROUGH_EXECUTION_CONTEXT_OPTIONS);
    expect(execution.messages).toEqual(chatMessages);
    expect(execution.messages[0]).toBe(chatMessages[0]);
  });

  test("keeps last maxMessages only", () => {
    const chatMessages = Array.from({ length: 5 }, (_, i) => userText(`u${i}`, `m${i}`));
    const execution = foldExecutionContext(
      { chatMessages },
      { ...DEFAULT_EXECUTION_CONTEXT_OPTIONS, maxMessages: 2 },
    );
    expect(execution.messages.map((m) => m.id)).toEqual(["u3", "u4"]);
  });

  test("truncates large tool outputs without mutating MandateProjection source", () => {
    const huge = "x".repeat(8_000);
    const chatMessages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "read_file",
            toolCallId: "c1",
            state: "output-available",
            input: { path: "/tmp/a" },
            output: { content: huge },
          },
        ],
      },
    ];
    const projection = { ...createEmptyMandateProjection(), chatMessages };
    const execution = foldExecutionContext(projection, {
      maxToolOutputChars: 100,
      maxMessages: 40,
      maxTextPartChars: 16_000,
    });

    const auditPart = projection.chatMessages[0]?.parts[0];
    expect(auditPart && "output" in auditPart ? auditPart.output : null).toEqual({
      content: huge,
    });

    const packedPart = execution.messages[0]?.parts[0];
    expect(packedPart && "output" in packedPart).toBe(true);
    if (packedPart && "output" in packedPart) {
      expect(typeof packedPart.output).toBe("string");
      expect(String(packedPart.output).length).toBeLessThanOrEqual(101);
      expect(String(packedPart.output).endsWith("…")).toBe(true);
    }
  });

  test("truncates long text parts for the model only", () => {
    const long = "y".repeat(1_000);
    const chatMessages: UIMessage[] = [userText("u", long)];
    const execution = foldExecutionContext(
      { chatMessages },
      { maxTextPartChars: 50, maxMessages: 40, maxToolOutputChars: 4_000 },
    );
    const part = execution.messages[0]?.parts[0];
    expect(part && part.type === "text" ? part.text.length : 0).toBe(51);
    expect(
      chatMessages[0]?.parts[0] && chatMessages[0].parts[0].type === "text"
        ? chatMessages[0].parts[0].text.length
        : 0,
    ).toBe(1_000);
  });
});
