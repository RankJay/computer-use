/**
 * Exclusive right to UI-automation Capabilities on the shared desktop.
 * Concurrency policy owns Attempt slots; this owns mouse/keyboard/a11y/focus-steal.
 * Phase v0: one global desktop lease; acquire is re-entrant for the same Attempt.
 * Cancel / Attempt settle / maintenance clear release the holder.
 */

export type OsLeaseScope = "desktop" | "app_window" | "none";

export type OsLeaseHolder = {
  readonly attemptId: string;
  readonly scope: Exclude<OsLeaseScope, "none">;
};

export type OsLeaseAcquireResult =
  | { readonly outcome: "granted" }
  | { readonly outcome: "rejected"; readonly holderAttemptId: string };

export type OsLease = {
  holder: () => OsLeaseHolder | null;
  /**
   * Acquire for `attemptId`. Same holder is re-entrant.
   * v0: reject if another Attempt holds (queue later).
   */
  acquire: (attemptId: string, scope: Exclude<OsLeaseScope, "none">) => OsLeaseAcquireResult;
  /** Release only if `attemptId` is the current holder. */
  release: (attemptId: string) => void;
  /** Force clear (maintenance / host reset). */
  clear: () => void;
};

export function createOsLease(): OsLease {
  let current: OsLeaseHolder | null = null;

  return {
    holder: () => current,
    acquire(attemptId, scope) {
      if (current && current.attemptId !== attemptId) {
        return { outcome: "rejected", holderAttemptId: current.attemptId };
      }
      current = { attemptId, scope };
      return { outcome: "granted" };
    },
    release(attemptId) {
      if (current?.attemptId === attemptId) {
        current = null;
      }
    },
    clear() {
      current = null;
    },
  };
}
