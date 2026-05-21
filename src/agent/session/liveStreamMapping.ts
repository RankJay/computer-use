import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { estimateCostUsd } from "@/agent/session/liveModelPricing";
import type {
  AgentEvent,
  AssistantTextDeltaEvent,
  PartialTokenUsage,
  TokenUsage,
  UsageDeltaEvent,
} from "@/agent/types";

export type LiveStreamTextDeltaChunk = {
  readonly type: "text-delta";
  readonly text: string;
};

export type UsageSnapshotScope = "step" | "run";

export type StreamUsageSnapshot = {
  readonly scope: UsageSnapshotScope;
  readonly usage: PartialTokenUsage;
};

type StreamChunk = {
  readonly type: string;
  readonly text?: string;
  readonly usage?: unknown;
  readonly totalUsage?: unknown;
  readonly rawValue?: unknown;
};

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

export function createEmptyUsageSnapshot(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
}

export function addUsageSnapshots(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
    cacheWriteInputTokens: left.cacheWriteInputTokens + right.cacheWriteInputTokens,
  };
}

export function mergeUsageSnapshot(
  current: TokenUsage,
  next: PartialTokenUsage,
): TokenUsage {
  return {
    inputTokens: next.inputTokens ?? current.inputTokens,
    outputTokens: next.outputTokens ?? current.outputTokens,
    cacheReadInputTokens: next.cacheReadInputTokens ?? current.cacheReadInputTokens,
    cacheWriteInputTokens: next.cacheWriteInputTokens ?? current.cacheWriteInputTokens,
  };
}

export function usageSnapshotDelta(next: TokenUsage, prev: TokenUsage): TokenUsage {
  return {
    inputTokens: positiveDelta(next.inputTokens, prev.inputTokens),
    outputTokens: positiveDelta(next.outputTokens, prev.outputTokens),
    cacheReadInputTokens: positiveDelta(next.cacheReadInputTokens, prev.cacheReadInputTokens),
    cacheWriteInputTokens: positiveDelta(next.cacheWriteInputTokens, prev.cacheWriteInputTokens),
  };
}

export function hasUsageDelta(delta: TokenUsage): boolean {
  return (
    delta.inputTokens > 0 ||
    delta.outputTokens > 0 ||
    delta.cacheReadInputTokens > 0 ||
    delta.cacheWriteInputTokens > 0
  );
}

export function mapUsageDeltaToAgentEvent(
  delta: TokenUsage,
  taskId: string,
  provider: LlmApiProvider,
  modelId: string,
  createEventMeta: () => Pick<AgentEvent, "id" | "at">,
): UsageDeltaEvent | null {
  if (!hasUsageDelta(delta)) {
    return null;
  }

  const meta = createEventMeta();
  return {
    ...meta,
    taskId,
    type: "usage.delta",
    delta: {
      ...delta,
      costUsd: estimateCostUsd(delta, provider, modelId),
    },
  };
}

export function extractUsageSnapshotFromStreamChunk(
  chunk: StreamChunk,
): StreamUsageSnapshot | null {
  if (chunk.type === "finish" && isRecord(chunk.totalUsage)) {
    return { scope: "run", usage: usageFromAiSdkUsage(chunk.totalUsage) };
  }

  if (chunk.type === "finish-step" && isRecord(chunk.usage)) {
    return { scope: "step", usage: usageFromAiSdkUsage(chunk.usage) };
  }

  if (chunk.type === "raw" && isRecord(chunk.rawValue)) {
    return usageFromRawProviderChunk(chunk.rawValue);
  }

  return null;
}

function usageFromAiSdkUsage(usage: Readonly<Record<string, unknown>>): PartialTokenUsage {
  const inputTokenDetails = recordProperty(usage, "inputTokenDetails");
  const cachedInputTokens = numberProperty(usage, "cachedInputTokens");

  return {
    inputTokens: numberProperty(usage, "inputTokens"),
    outputTokens: numberProperty(usage, "outputTokens"),
    cacheReadInputTokens: numberProperty(inputTokenDetails, "cacheReadTokens") ?? cachedInputTokens,
    cacheWriteInputTokens: numberProperty(inputTokenDetails, "cacheWriteTokens"),
  };
}

function usageFromRawProviderChunk(
  raw: Readonly<Record<string, unknown>>,
): StreamUsageSnapshot | null {
  const anthropicUsage = usageFromAnthropicRawChunk(raw);
  if (anthropicUsage !== null) {
    return { scope: "step", usage: anthropicUsage };
  }

  const openAiUsage = usageFromOpenAiRawChunk(raw);
  if (openAiUsage !== null) {
    return { scope: "step", usage: openAiUsage };
  }

  return null;
}

function usageFromAnthropicRawChunk(
  raw: Readonly<Record<string, unknown>>,
): PartialTokenUsage | null {
  const message = recordProperty(raw, "message");
  const usage = recordProperty(raw, "usage") ?? recordProperty(message, "usage");

  if (usage === null) {
    return null;
  }

  const usageSnapshot = {
    inputTokens: numberProperty(usage, "input_tokens"),
    outputTokens: numberProperty(usage, "output_tokens"),
    cacheReadInputTokens: numberProperty(usage, "cache_read_input_tokens"),
    cacheWriteInputTokens: numberProperty(usage, "cache_creation_input_tokens"),
  };
  return hasPartialUsage(usageSnapshot) ? usageSnapshot : null;
}

function usageFromOpenAiRawChunk(
  raw: Readonly<Record<string, unknown>>,
): PartialTokenUsage | null {
  const usage = recordProperty(raw, "usage");
  if (usage === null) {
    return null;
  }

  const promptDetails = recordProperty(usage, "prompt_tokens_details");
  const inputDetails = recordProperty(usage, "input_tokens_details");

  const usageSnapshot = {
    inputTokens: numberProperty(usage, "prompt_tokens") ?? numberProperty(usage, "input_tokens"),
    outputTokens:
      numberProperty(usage, "completion_tokens") ?? numberProperty(usage, "output_tokens"),
    cacheReadInputTokens:
      numberProperty(promptDetails, "cached_tokens") ??
      numberProperty(inputDetails, "cached_tokens"),
  };
  return hasPartialUsage(usageSnapshot) ? usageSnapshot : null;
}

function positiveDelta(next: number, prev: number): number {
  return Math.max(next - prev, 0);
}

function hasPartialUsage(usage: PartialTokenUsage): boolean {
  return (
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cacheReadInputTokens !== undefined ||
    usage.cacheWriteInputTokens !== undefined
  );
}

function numberProperty(
  record: Readonly<Record<string, unknown>> | null,
  key: string,
): number | undefined {
  if (record === null) {
    return undefined;
  }

  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordProperty(
  record: Readonly<Record<string, unknown>> | null,
  key: string,
): Readonly<Record<string, unknown>> | null {
  if (record === null) {
    return null;
  }

  const value = record[key];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
