/**
 * In-process index of the live Attempt + UI focus pointers.
 * Phase 1 concurrency (cancel-previous) still lives in RunController;
 * this registry records identity so Clients can reattach without owning the loop.
 */

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
  /** Maintenance: clear live + focus pointers (engine reset is separate). */
  resetPointers: () => void;
};

export function createAttemptRegistry(): AttemptRegistry {
  let live: LiveAttempt | null = null;
  let liveChatId: string | null = null;
  let focusedMandateId: string | null = null;

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
    resetPointers: () => {
      live = null;
      liveChatId = null;
      focusedMandateId = null;
    },
  };
}
