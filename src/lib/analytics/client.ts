import { createNoopAnalyticsPort } from "@/lib/analytics/adapters/noop";
import { isAnalyticsEnabled } from "@/lib/analytics/enabled";
import type { AnalyticsPort, AnalyticsProperties } from "@/lib/analytics/port";

export { isAnalyticsEnabled } from "@/lib/analytics/enabled";

type PendingOp =
  | { kind: "capture"; event: string; properties?: AnalyticsProperties }
  | { kind: "identify"; distinctId: string; properties: { email: string; name: string } }
  | { kind: "reset" }
  | { kind: "flush" };

let resolved: AnalyticsPort | null = null;
const pending: PendingOp[] = [];
let initPromise: Promise<void> | null = null;
/** Test-only: keep unresolved so ops hit the buffering port (even when disabled). */
let bufferForTests = false;

function flushPending(port: AnalyticsPort): void {
  for (const op of pending) {
    switch (op.kind) {
      case "capture":
        port.capture(op.event, op.properties);
        break;
      case "identify":
        port.identify(op.distinctId, op.properties);
        break;
      case "reset":
        port.reset();
        break;
      case "flush":
        port.flush();
        break;
      default: {
        const _exhaustive: never = op;
        void _exhaustive;
      }
    }
  }
  pending.length = 0;
}

/** Buffers until `initAnalytics` resolves the real transport (or noop). */
const bufferingPort: AnalyticsPort = {
  capture(event, properties) {
    if (resolved) {
      resolved.capture(event, properties);
      return;
    }
    pending.push({ kind: "capture", event, properties });
  },
  identify(distinctId, properties) {
    if (resolved) {
      resolved.identify(distinctId, properties);
      return;
    }
    pending.push({ kind: "identify", distinctId, properties });
  },
  reset() {
    if (resolved) {
      resolved.reset();
      return;
    }
    pending.push({ kind: "reset" });
  },
  flush() {
    if (resolved) {
      resolved.flush();
      return;
    }
    pending.push({ kind: "flush" });
  },
};

function resolvePort(port: AnalyticsPort): void {
  flushPending(port);
  resolved = port;
}

/** Process-wide product analytics port (PostHog, noop, or buffering pre-init). */
export function getAnalyticsPort(): AnalyticsPort {
  if (resolved) {
    return resolved;
  }
  if (bufferForTests) {
    return bufferingPort;
  }
  if (!isAnalyticsEnabled()) {
    const noop = createNoopAnalyticsPort();
    resolvePort(noop);
    return noop;
  }
  return bufferingPort;
}

/**
 * Replace port (tests).
 * Non-null: flush buffered ops onto `next` (same as production resolve).
 * Null: drop buffer and clear resolved.
 */
export function setAnalyticsPortForTests(next: AnalyticsPort | null): void {
  initPromise = null;
  bufferForTests = false;
  if (next === null) {
    pending.length = 0;
    resolved = null;
    return;
  }
  flushPending(next);
  resolved = next;
}

/** Leave port unresolved so subsequent ops buffer until set/init (tests). */
export function beginAnalyticsBufferingForTests(): void {
  pending.length = 0;
  resolved = null;
  initPromise = null;
  bufferForTests = true;
}

/**
 * Resolve transport. PostHog adapter is dynamically imported so disabled builds
 * never load `posthog-js`.
 */
export function initAnalytics(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (resolved) {
      return;
    }
    if (!isAnalyticsEnabled()) {
      resolvePort(createNoopAnalyticsPort());
      return;
    }

    const { createPostHogAnalyticsPort, initPostHogAnalytics } =
      await import("@/lib/analytics/adapters/posthog");
    initPostHogAnalytics();
    resolvePort(createPostHogAnalyticsPort());
  })();

  return initPromise;
}
