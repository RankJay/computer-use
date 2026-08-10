import type { AnalyticsPort, AnalyticsProperties } from "@/lib/analytics/port";

export type RecordedAnalyticsEntry =
  | { kind: "capture"; event: string; properties: AnalyticsProperties }
  | { kind: "identify"; distinctId: string; properties: { email: string; name: string } }
  | { kind: "reset" }
  | { kind: "flush" };

/**
 * Test adapter — append-only log.
 * Expects product traffic via captureProductEvent (already catalog-sanitized).
 */
export function createRecordingMemoryAnalyticsPort(): AnalyticsPort & {
  readonly entries: readonly RecordedAnalyticsEntry[];
  clear(): void;
} {
  const entries: RecordedAnalyticsEntry[] = [];

  return {
    get entries() {
      return entries;
    },
    clear() {
      entries.length = 0;
    },
    capture(event, properties) {
      entries.push({ kind: "capture", event, properties: properties ?? {} });
    },
    identify(distinctId, properties) {
      entries.push({ kind: "identify", distinctId, properties });
    },
    reset() {
      entries.push({ kind: "reset" });
    },
    flush() {
      entries.push({ kind: "flush" });
    },
  };
}
