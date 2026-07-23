import { isDynamicToolUIPart, isTextUIPart, isToolUIPart, type UIMessage } from "ai";

import type { MandateProjection } from "./projection";

type MessagePart = UIMessage["parts"][number];

/**
 * Compact model-facing fold over the same Attempt event log / MandateProjection.
 * Audit/UI Clients read MandateProjection; AttemptControl packs from this.
 */
export type ModelContext = {
  readonly messages: UIMessage[];
};

export type ModelContextOptions = {
  /** Keep only the last N messages (oldest dropped). Default 40. */
  readonly maxMessages?: number;
  /** Truncate tool/dynamic-tool `output` JSON beyond this many chars. Default 4_000. */
  readonly maxToolOutputChars?: number;
  /** Truncate text parts beyond this many chars. Default 16_000. */
  readonly maxTextPartChars?: number;
};

export const DEFAULT_MODEL_CONTEXT_OPTIONS = {
  maxMessages: 40,
  maxToolOutputChars: 4_000,
  maxTextPartChars: 16_000,
} as const satisfies Required<ModelContextOptions>;

/** Dark-launch / rollback: seam still used, no compaction. */
export const PASSTHROUGH_MODEL_CONTEXT_OPTIONS = {
  maxMessages: Number.POSITIVE_INFINITY,
  maxToolOutputChars: Number.POSITIVE_INFINITY,
  maxTextPartChars: Number.POSITIVE_INFINITY,
} as const satisfies Required<ModelContextOptions>;

function truncateChars(value: string, max: number): string {
  if (!Number.isFinite(max) || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…`;
}

function truncateJsonValue(value: unknown, max: number): unknown {
  if (!Number.isFinite(max)) {
    return value;
  }
  if (value === undefined) {
    return value;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  if (serialized.length <= max) {
    return value;
  }
  return truncateChars(serialized, max);
}

function compactPart(part: MessagePart, options: Required<ModelContextOptions>): MessagePart {
  if (isTextUIPart(part)) {
    const text = truncateChars(part.text, options.maxTextPartChars);
    if (text === part.text) {
      return part;
    }
    return { ...part, text };
  }

  if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
    if (!("output" in part) || part.output === undefined) {
      return part;
    }
    const output = truncateJsonValue(part.output, options.maxToolOutputChars);
    if (Object.is(output, part.output)) {
      return part;
    }
    return { ...part, output };
  }

  return part;
}

function compactMessage(message: UIMessage, options: Required<ModelContextOptions>): UIMessage {
  let changed = false;
  const parts = message.parts.map((part) => {
    const next = compactPart(part, options);
    if (!Object.is(next, part)) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...message, parts } : message;
}

/**
 * Fold MandateProjection (or any chatMessages view) into ModelContext.
 * Same underlying log/view; different deterministic compaction for the model.
 */
export function foldModelContext(
  source: Pick<MandateProjection, "chatMessages">,
  options?: ModelContextOptions,
): ModelContext {
  const resolved: Required<ModelContextOptions> = {
    maxMessages: options?.maxMessages ?? DEFAULT_MODEL_CONTEXT_OPTIONS.maxMessages,
    maxToolOutputChars:
      options?.maxToolOutputChars ?? DEFAULT_MODEL_CONTEXT_OPTIONS.maxToolOutputChars,
    maxTextPartChars: options?.maxTextPartChars ?? DEFAULT_MODEL_CONTEXT_OPTIONS.maxTextPartChars,
  };

  const all = source.chatMessages;
  const sliced =
    Number.isFinite(resolved.maxMessages) && all.length > resolved.maxMessages
      ? all.slice(all.length - resolved.maxMessages)
      : all;

  const messages = sliced.map((message) => compactMessage(message, resolved));
  return { messages };
}
