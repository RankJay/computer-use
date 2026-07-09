import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { applyDemoEvent } from "./apply-demo-event";
import { createDemoRunEvents } from "./demo-run-events";
import { createEmptyTranscriptState, type TranscriptState, type TranscriptStatus } from "./types";

const EVENT_DELAY_MS = 30;

type Listener = () => void;

type MockAgentStreamStore = {
  getSnapshot: () => TranscriptState;
  subscribe: (listener: Listener) => () => void;
  start: (prompt: string) => void;
  cancel: () => void;
};

function createMockAgentStreamStore(): MockAgentStreamStore {
  let state = createEmptyTranscriptState();
  const listeners = new Set<Listener>();
  let pending: TranscriptState | null = null;
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let runId = 0;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const clearTimers = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pending = null;
  };

  const flush = () => {
    rafId = null;
    if (!pending) return;
    state = pending;
    pending = null;
    emit();
  };

  const commit = (next: TranscriptState) => {
    pending = next;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(flush);
  };

  const cancel = () => {
    runId += 1;
    clearTimers();
    state = {
      ...state,
      status: "cancelled",
      streamingMessageId: null,
    };
    emit();
  };

  const start = (prompt: string) => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;

    runId += 1;
    const currentRunId = runId;
    clearTimers();

    const events = createDemoRunEvents(trimmed);
    let index = 0;
    state = createEmptyTranscriptState();
    emit();

    const step = () => {
      if (currentRunId !== runId) return;
      if (index >= events.length) return;

      const event = events[index];
      index += 1;
      if (!event) return;

      state = applyDemoEvent(state, event);
      commit(state);

      if (index < events.length) {
        timerId = setTimeout(step, EVENT_DELAY_MS);
      }
    };

    timerId = setTimeout(step, EVENT_DELAY_MS);
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    cancel,
  };
}

export type MockAgentStreamControls = {
  start: (prompt: string) => void;
  cancel: () => void;
  cancelVisible: boolean;
  inputDisabled: boolean;
  status: TranscriptStatus;
};

export type MockAgentTranscriptSlice = {
  rows: TranscriptState["rows"];
  streamingMessageId: string | null;
};

/** Stable store for the home chat session — create once per page mount. */
export function useMockAgentStreamStore(): MockAgentStreamStore {
  const storeRef = useRef<MockAgentStreamStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createMockAgentStreamStore();
  }
  return storeRef.current;
}

/** Hot path: only re-renders when rows / streamingMessageId change. */
export function useMockAgentTranscript(store: MockAgentStreamStore): MockAgentTranscriptSlice {
  const rows = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().rows,
    () => store.getSnapshot().rows,
  );
  const streamingMessageId = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().streamingMessageId,
    () => store.getSnapshot().streamingMessageId,
  );
  return useMemo(() => ({ rows, streamingMessageId }), [rows, streamingMessageId]);
}

/** Warm path: only re-renders when run status / control flags change. */
export function useMockAgentControls(store: MockAgentStreamStore): MockAgentStreamControls {
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().status,
    () => store.getSnapshot().status,
  );

  const start = useCallback((prompt: string) => store.start(prompt), [store]);
  const cancel = useCallback(() => store.cancel(), [store]);

  return useMemo(
    () => ({
      start,
      cancel,
      status,
      cancelVisible: status === "streaming",
      inputDisabled: status === "streaming",
    }),
    [start, cancel, status],
  );
}
