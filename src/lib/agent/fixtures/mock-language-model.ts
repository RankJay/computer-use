import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const EMPTY_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
} as const;

/** Minimal assistant text stream that finishes cleanly. */
export function textStreamChunks(text: string, textId = "text-1"): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: text },
    { type: "text-end", id: textId },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      usage: EMPTY_USAGE,
    },
  ];
}

export function reasoningThenTextChunks(
  reasoning: string,
  text: string,
): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "r-1" },
    { type: "reasoning-delta", id: "r-1", delta: reasoning },
    { type: "reasoning-end", id: "r-1" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: text },
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      usage: EMPTY_USAGE,
    },
  ];
}

/** Tool call stream for a low-risk capability (e.g. read_file). */
export function toolCallStreamChunks(input: {
  toolCallId: string;
  toolName: string;
  argsJson: string;
}): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-input-start",
      id: input.toolCallId,
      toolName: input.toolName,
    },
    {
      type: "tool-input-delta",
      id: input.toolCallId,
      delta: input.argsJson,
    },
    { type: "tool-input-end", id: input.toolCallId },
    {
      type: "tool-call",
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      input: input.argsJson,
    },
    {
      type: "finish",
      finishReason: { unified: "tool-calls", raw: undefined },
      usage: EMPTY_USAGE,
    },
  ];
}

export function errorFinishChunks(): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "partial" },
    { type: "text-end", id: "text-1" },
    {
      type: "finish",
      finishReason: { unified: "error", raw: undefined },
      usage: EMPTY_USAGE,
    },
  ];
}

export function createMockStreamingModel(chunks: LanguageModelV4StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks }),
    }),
  });
}

export function createTextMockModel(text = "Hello") {
  return createMockStreamingModel(textStreamChunks(text));
}
