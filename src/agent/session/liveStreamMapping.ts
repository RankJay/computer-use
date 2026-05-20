import { smoothStream } from "ai";

import type { AgentEvent, AssistantTextDeltaEvent } from "@/agent/types";

export type LiveStreamTextDeltaChunk = {
  readonly type: "text-delta";
  readonly text: string;
};

/** Buffers provider bursts and releases word-sized chunks with a steady cadence. */
export const assistantTextStreamTransform = smoothStream({
  chunking: "word",
  delayInMs: 24,
});

export function mapAssistantTextDeltaChunk(
  chunk: LiveStreamTextDeltaChunk,
  taskId: string,
  id: string,
  at: number,
): AssistantTextDeltaEvent {
  return {
    id,
    at,
    taskId,
    type: "assistant.text.delta",
    text: chunk.text,
  };
}

export function mapStreamChunkToAgentEvent(
  chunk: { readonly type: string; readonly text?: string },
  taskId: string,
  createEventMeta: () => Pick<AgentEvent, "id" | "at">,
): AssistantTextDeltaEvent | null {
  if (chunk.type !== "text-delta" || typeof chunk.text !== "string") {
    return null;
  }
  const meta = createEventMeta();
  return mapAssistantTextDeltaChunk(
    { type: "text-delta", text: chunk.text },
    taskId,
    meta.id,
    meta.at,
  );
}
