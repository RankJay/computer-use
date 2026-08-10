import type { AnalyticsPort } from "@/lib/analytics/port";

export function createNoopAnalyticsPort(): AnalyticsPort {
  return {
    capture() {},
    identify() {},
    reset() {},
    flush() {},
  };
}
