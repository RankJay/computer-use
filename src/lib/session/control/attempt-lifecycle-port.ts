/**
 * Session-owned seam for Attempt product analytics.
 * Analytics supplies the adapter; session never imports PostHog.
 */

export type AttemptBlockedReason =
  | "entitlement_denied"
  | "require_upgrade"
  | "concurrency_reject"
  | "workspace_not_ready";

export type AttemptCompletedFinishReason = "stop" | "cancelled" | "budget";

export type AttemptLifecycleEvent =
  | {
      type: "started";
      attemptId: string;
      model: string;
    }
  | {
      type: "blocked";
      reason: AttemptBlockedReason;
      capability?: string;
    }
  | {
      type: "settled";
      attemptId: string;
      outcome: "completed";
      finish_reason: AttemptCompletedFinishReason;
      duration_ms: number;
    }
  | {
      type: "settled";
      attemptId: string;
      outcome: "failed";
      error_code: string;
      duration_ms: number;
    };

export type AttemptLifecyclePort = {
  notify(event: AttemptLifecycleEvent): void;
};

export const noopAttemptLifecyclePort: AttemptLifecyclePort = {
  notify() {},
};
