import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createProduceRun,
  createSessionEngine,
  deriveSessionControls,
  setActiveSessionEngine,
  type SessionControls,
  type SessionEngine,
  type SessionProjection,
} from "@/lib/session";
import { useLoadedSettings, useUpdateSettings } from "@/lib/settings/queries";

type Listener = () => void;

type BatchedEngine = {
  engine: SessionEngine;
  getSnapshot: () => SessionProjection;
  subscribe: (listener: Listener) => () => void;
};

function createBatchedEngine(): BatchedEngine {
  const engine = createSessionEngine({ produceRun: createProduceRun() });
  let snapshot = engine.getProjection();
  let pending: SessionProjection | null = null;
  let rafId: number | null = null;
  const listeners = new Set<Listener>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const flush = () => {
    rafId = null;
    if (!pending) return;
    snapshot = pending;
    pending = null;
    emit();
  };

  engine.subscribe(() => {
    pending = engine.getProjection();
    if (rafId !== null) return;
    rafId = requestAnimationFrame(flush);
  });

  return {
    engine,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AgentTranscriptSlice = {
  rows: SessionProjection["rows"];
  streamingMessageId: string | null;
};

export type AgentSessionControls = SessionControls & {
  status: SessionProjection["status"];
  usage: SessionProjection["usage"];
  start: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  modelId: string;
  onModelChange: (modelId: string) => void;
};

/** Stable engine for the home chat session — create once per page mount. */
export function useAgentSessionStore(): BatchedEngine {
  const storeRef = useRef<BatchedEngine | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createBatchedEngine();
  }

  useEffect(() => {
    const { engine } = storeRef.current!;
    setActiveSessionEngine(engine);
    return () => {
      setActiveSessionEngine(null);
    };
  }, []);

  return storeRef.current;
}

/** Hot path: only re-renders when rows / streamingMessageId change. */
export function useAgentTranscript(store: BatchedEngine): AgentTranscriptSlice {
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

/** Warm path: control flags, usage, submit/cancel/retry, model binding. */
export function useAgentSessionControls(store: BatchedEngine): AgentSessionControls {
  const { data: settings } = useLoadedSettings();
  const updateSettings = useUpdateSettings();

  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().status,
    () => store.getSnapshot().status,
  );
  const failure = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().failure,
    () => store.getSnapshot().failure,
  );
  const pendingPermissions = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().pendingPermissions,
    () => store.getSnapshot().pendingPermissions,
  );
  const usage = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().usage,
    () => store.getSnapshot().usage,
  );

  const controls = useMemo(
    () =>
      deriveSessionControls({
        ...store.getSnapshot(),
        status,
        failure,
        pendingPermissions,
      }),
    [store, status, failure, pendingPermissions],
  );

  const start = useCallback(
    async (prompt: string) => {
      const projection = store.engine.getProjection();
      const { secrets, ...appSettings } = settings;
      await store.engine.start({
        prompt,
        modelId: appSettings.selectedModelId,
        chatMessages: projection.chatMessages,
        settings: appSettings,
        secrets,
      });
    },
    [store, settings],
  );

  const cancel = useCallback(() => store.engine.cancel(), [store]);
  const retry = useCallback(() => store.engine.retry(), [store]);

  const onModelChange = useCallback(
    (modelId: string) => {
      updateSettings.mutate({ selectedModelId: modelId });
    },
    [updateSettings],
  );

  return useMemo(
    () => ({
      ...controls,
      status,
      usage,
      start,
      cancel,
      retry,
      modelId: settings.selectedModelId,
      onModelChange,
    }),
    [controls, status, usage, start, cancel, retry, settings.selectedModelId, onModelChange],
  );
}
