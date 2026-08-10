/**
 * Narrow product analytics transport. PostHog / RecordingMemory adapters implement this.
 * Product capture must go through captureProductEvent (catalog sanitize); adapters do not re-sanitize.
 */

export type AnalyticsProperties = Record<string, string | number | boolean | string[] | undefined>;

export type AnalyticsPort = {
  capture(event: string, properties?: AnalyticsProperties): void;
  identify(distinctId: string, properties: { email: string; name: string }): void;
  reset(): void;
  /** Best-effort queue drain (quit / pagehide). */
  flush(): void;
};
