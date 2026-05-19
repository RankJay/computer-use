import { joinStreamingText } from "@/agent/session/streamingTextJoin";

/** Join assistant segments from separate timeline rows into one readable block. */
export function joinAssistantText(previous: string, next: string): string {
  return joinStreamingText(previous, next);
}
