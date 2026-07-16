import type { UIMessage } from "ai";

/** Join text parts as markdown source (excludes tools/reasoning/etc.). */
export function textPartsMarkdown(message: UIMessage): string {
  const texts: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      texts.push(part.text);
    }
  }
  return texts.join("\n\n");
}

export type RegeneratePlan = {
  /** Messages kept through the preceding user turn (inclusive). */
  readonly messages: UIMessage[];
  /** Prompt text from that user turn. */
  readonly prompt: string;
};

/**
 * Truncate for regenerate-from-answer:
 * keep all turns before the clicked assistant's user prompt,
 * keep that user prompt, drop the assistant answer and everything after.
 */
export function planRegenerateFromAssistant(
  messages: readonly UIMessage[],
  assistantMessageId: string,
): RegeneratePlan | null {
  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId && message.role === "assistant",
  );
  if (assistantIndex === -1) {
    return null;
  }

  let userIndex = -1;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      userIndex = index;
      break;
    }
  }
  if (userIndex === -1) {
    return null;
  }

  const userMessage = messages[userIndex];
  if (!userMessage) {
    return null;
  }

  const prompt = textPartsMarkdown(userMessage);
  if (prompt.trim().length === 0) {
    return null;
  }

  return {
    messages: messages.slice(0, userIndex + 1),
    prompt,
  };
}
