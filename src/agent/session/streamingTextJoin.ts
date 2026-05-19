/** Join streamed assistant chunks without gluing words (e.g. "guide:" + "Since"). */
export function joinStreamingText(previous: string, chunk: string): string {
  if (chunk.length === 0) return previous;
  if (previous.length === 0) return chunk;
  if (/\s$/.test(previous) || /^\s/.test(chunk)) {
    return previous + chunk;
  }

  const previousChar = previous[previous.length - 1] ?? "";
  const nextChar = chunk[0] ?? "";

  if (/[.!?:]$/.test(previous) && /[A-Za-z0-9]/.test(nextChar)) {
    return `${previous} ${chunk}`;
  }

  if (/[,.;)]$/.test(previous) && /[A-Za-z]/.test(nextChar)) {
    return `${previous} ${chunk}`;
  }

  if (/[a-z0-9)]$/i.test(previousChar) && /^[A-Z]/.test(chunk)) {
    return `${previous} ${chunk}`;
  }

  return previous + chunk;
}
