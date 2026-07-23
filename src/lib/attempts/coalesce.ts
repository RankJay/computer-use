import type { RuntimeEvent } from "@/lib/session/events";

/**
 * Compact a durable-write batch: keep only the latest `assistant.part_updated`
 * per (messageId, partIndex). Avoids O(n²) growing text snapshots on disk.
 */
export function coalesceDurableEvents(events: readonly RuntimeEvent[]): RuntimeEvent[] {
  const result: RuntimeEvent[] = [];
  const partSlot = new Map<string, number>();

  for (const event of events) {
    if (event.type === "assistant.part_updated") {
      const key = `${event.messageId}\0${event.partIndex}`;
      const existing = partSlot.get(key);
      if (existing !== undefined) {
        result[existing] = event;
        continue;
      }
      partSlot.set(key, result.length);
      result.push(event);
      continue;
    }

    if (event.type === "assistant.message_finished") {
      for (const key of partSlot.keys()) {
        if (key.startsWith(`${event.messageId}\0`)) {
          partSlot.delete(key);
        }
      }
    }

    result.push(event);
  }

  return result;
}
