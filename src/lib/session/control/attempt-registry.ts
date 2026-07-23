/**
 * In-process index of the live Attempt + UI focus pointers.
 * ConcurrencyPolicy is swappable here; Phase 1 RunController still cancel-previous
 * for interactive starts. Triggers use evaluateTriggerWake + this policy.
 */

import { cancelPreviousConcurrencyPolicy, type ConcurrencyPolicy } from "./concurrency-policy";

export type LiveAttempt = {
  mandateId: string;
  attemptId: string;
};

export type AttemptRegistry = {
  getLive: () => LiveAttempt | null;
  setLive: (live: LiveAttempt) => void;
  clearLive: () => void;
  getLiveChatId: () => string | null;
  setLiveChatId: (chatId: string | null) => void;
  getFocusedMandateId: () => string | null;
  setFocusedMandateId: (mandateId: string | null) => void;
  getConcurrencyPolicy: () => ConcurrencyPolicy;
  setConcurrencyPolicy: (policy: ConcurrencyPolicy) => void;
  /** Maintenance: clear live + focus pointers (engine reset is separate). */
  resetPointers: () => void;
};

export function createAttemptRegistry(
  initialConcurrency: ConcurrencyPolicy = cancelPreviousConcurrencyPolicy,
): AttemptRegistry {
  let live: LiveAttempt | null = null;
  let liveChatId: string | null = null;
  let focusedMandateId: string | null = null;
  let concurrencyPolicy = initialConcurrency;

  return {
    getLive: () => live,
    setLive: (next) => {
      live = next;
      focusedMandateId = next.mandateId;
    },
    clearLive: () => {
      live = null;
    },
    getLiveChatId: () => liveChatId,
    setLiveChatId: (chatId) => {
      liveChatId = chatId;
    },
    getFocusedMandateId: () => focusedMandateId,
    setFocusedMandateId: (mandateId) => {
      focusedMandateId = mandateId;
    },
    getConcurrencyPolicy: () => concurrencyPolicy,
    setConcurrencyPolicy: (policy) => {
      concurrencyPolicy = policy;
    },
    resetPointers: () => {
      live = null;
      liveChatId = null;
      focusedMandateId = null;
    },
  };
}
