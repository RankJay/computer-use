/** Format stream/tool errors for the AI SDK onError callback. Capabilities land in Phase 4. */
export function formatToolStreamError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.trim().length > 0) {
      return error.message;
    }
    return error.stack ?? "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}
