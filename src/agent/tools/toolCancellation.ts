import { timeoutMsForTool, type AgentToolName } from "@/agent/toolContract";
import type { ToolErrorPayload } from "@/agent/types";

export const TOOL_CANCELLED_REASON = "Cancelled by user.";

export class ToolCancelledError extends Error {
  constructor(message = TOOL_CANCELLED_REASON) {
    super(message);
    this.name = "ToolCancelledError";
  }
}

export class ToolTimeoutError extends Error {
  readonly payload: ToolErrorPayload;

  constructor(toolName: AgentToolName, timeoutMs: number, elapsedMs: number) {
    super(`${toolName} timed out after ${timeoutMs} ms`);
    this.name = "ToolTimeoutError";
    this.payload = {
      kind: "timeout",
      timeoutMs,
      elapsedMs,
    };
  }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ToolCancelledError();
  }
}

export function isCancellationError(err: unknown): boolean {
  if (err instanceof ToolCancelledError) {
    return true;
  }
  if (!(err instanceof Error)) {
    return false;
  }
  return err.name === "AbortError" || err.message.toLowerCase().includes("cancelled");
}

export function isToolTimeoutError(err: unknown): err is ToolTimeoutError {
  return err instanceof ToolTimeoutError;
}

export function toolTimeoutFromNativeError(
  err: unknown,
  toolName: AgentToolName,
): ToolTimeoutError | null {
  if (isToolTimeoutError(err)) {
    return err;
  }
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const timeoutMs = timeoutMsForTool(toolName);
  if (!message.includes(`timed out after ${timeoutMs} ms`)) {
    return null;
  }
  return new ToolTimeoutError(toolName, timeoutMs, timeoutMs);
}

export async function withToolTimeout<T>(
  toolName: AgentToolName,
  work: Promise<T>,
  onTimeout?: () => Promise<void>,
  timeoutMsOverride?: number,
): Promise<T> {
  const timeoutMs = timeoutMsOverride ?? timeoutMsForTool(toolName);
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const elapsedMs = Date.now() - startedAt;
      const timeoutError = new ToolTimeoutError(toolName, timeoutMs, elapsedMs);
      if (onTimeout === undefined) {
        reject(timeoutError);
        return;
      }
      void onTimeout().finally(() => reject(timeoutError));
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function abortable<T>(
  signal: AbortSignal,
  work: Promise<T>,
  onAbort?: () => Promise<void>,
): Promise<T> {
  throwIfAborted(signal);

  let abortListener: (() => void) | null = null;
  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () => {
      if (onAbort !== undefined) {
        void onAbort().catch(() => {
          /** best-effort native cancellation */
        });
      }
      reject(new ToolCancelledError());
    };
    signal.addEventListener("abort", abortListener, { once: true });
  });

  try {
    return await Promise.race([work, abortPromise]);
  } finally {
    if (abortListener !== null) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}
