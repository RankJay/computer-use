import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import {
  createProduceRun,
  createSessionEngine,
  deriveDisplayRows,
  deriveSessionControls,
  setActiveSessionEngine,
  type AgentTranscriptRow,
  type PendingPermission,
  type PermissionDecision,
  type SessionControls,
  type SessionEngine,
  type SessionFailure,
  type SessionProjection,
} from "@/lib/session";
import {
  useLoadedSettings,
  usePersistToolApproval,
  useUpdateSettings,
} from "@/lib/settings/queries";
import type { PermissionMode } from "@/lib/settings/types";

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
  rows: readonly AgentTranscriptRow[];
  streamingMessageId: string | null;
  pendingPermissions: readonly PendingPermission[];
};

export type AgentSessionControls = SessionControls & {
  status: SessionProjection["status"];
  failure: SessionFailure | null;
  usage: SessionProjection["usage"];
  start: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
  modelId: string;
  onModelChange: (modelId: string) => void;
  permissionMode: PermissionMode;
  pendingPermissions: readonly PendingPermission[];
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

/** Hot path: display rows (presentation derive) + streaming / pending permission slices. */
export function useAgentTranscript(store: BatchedEngine): AgentTranscriptSlice {
  const projection = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
  const rows = useMemo(() => deriveDisplayRows(projection), [projection]);
  return useMemo(
    () => ({
      rows,
      streamingMessageId: projection.streamingMessageId,
      pendingPermissions: projection.pendingPermissions,
    }),
    [rows, projection.streamingMessageId, projection.pendingPermissions],
  );
}

/** Warm path: control flags, usage, submit/cancel/retry, model binding. */
export function useAgentSessionControls(store: BatchedEngine): AgentSessionControls {
  const { data: settings } = useLoadedSettings();
  const updateSettings = useUpdateSettings();
  const persistToolApproval = usePersistToolApproval();

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
        persistApproval: persistToolApproval,
      });
    },
    [store, settings, persistToolApproval],
  );

  const cancel = useCallback(() => store.engine.cancel(), [store]);
  const retry = useCallback(() => store.engine.retry(), [store]);
  const resolvePermission = useCallback(
    (callId: string, decision: PermissionDecision, persist?: boolean) =>
      store.engine.resolvePermission(callId, decision, persist),
    [store],
  );

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
      failure,
      usage,
      start,
      cancel,
      retry,
      resolvePermission,
      modelId: settings.selectedModelId,
      onModelChange,
      permissionMode: settings.permissionMode,
      pendingPermissions,
    }),
    [
      controls,
      status,
      failure,
      usage,
      start,
      cancel,
      retry,
      resolvePermission,
      settings.selectedModelId,
      settings.permissionMode,
      onModelChange,
      pendingPermissions,
    ],
  );
}
