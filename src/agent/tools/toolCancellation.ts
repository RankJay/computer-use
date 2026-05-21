export const TOOL_CANCELLED_REASON = "Cancelled by user.";

export class ToolCancelledError extends Error {
  constructor(message = TOOL_CANCELLED_REASON) {
    super(message);
    this.name = "ToolCancelledError";
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
