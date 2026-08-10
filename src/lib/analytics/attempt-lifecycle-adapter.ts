import {
  captureAttemptBlocked,
  captureAttemptCompleted,
  captureAttemptFailed,
  captureAttemptStarted,
} from "@/lib/analytics/capture";
import type {
  AttemptLifecycleEvent,
  AttemptLifecyclePort,
} from "@/lib/session/control/attempt-lifecycle-port";

/** Maps session AttemptLifecyclePort → product events. Stateless. */
export function createAttemptLifecycleAnalyticsAdapter(): AttemptLifecyclePort {
  return {
    notify(event: AttemptLifecycleEvent): void {
      switch (event.type) {
        case "started":
          captureAttemptStarted({
            attempt_id: event.attemptId,
            model: event.model,
          });
          return;
        case "blocked":
          captureAttemptBlocked({
            reason: event.reason,
            capability: event.capability,
          });
          return;
        case "settled":
          if (event.outcome === "completed") {
            captureAttemptCompleted({
              attempt_id: event.attemptId,
              finish_reason: event.finish_reason,
              duration_ms: event.duration_ms,
            });
            return;
          }
          captureAttemptFailed({
            attempt_id: event.attemptId,
            error_code: event.error_code,
            duration_ms: event.duration_ms,
          });
          return;
        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
    },
  };
}
