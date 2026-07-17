import { useQueryClient } from "@tanstack/react-query";
import type { LanguageModelUsage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  createSessionEngine,
  deriveDisplayRows,
  deriveSessionControls,
  isLiveWorkspaceReady,
  setActiveSessionEngine,
  type AgentTranscriptRow,
  type PendingPermission,
  type PermissionDecision,
  type SessionControls,
  type SessionEngine,
  type SessionFailure,
  type SessionProjection,
} from "@/lib/session";
import { createProduceRun } from "@/lib/session/producers/select-producer";
import { DEFAULT_SECRETS } from "@/lib/settings/defaults";
import {
  ensureSecretsReady,
  settingsQueryOptions,
  usePersistToolApproval,
  useSettingsSelector,
  useUpdateSettings,
} from "@/lib/settings/queries";
import { selectPermissionMode, selectSelectedModelId } from "@/lib/settings/selectors";
import type { PermissionMode } from "@/lib/settings/types";

export type ComposerContextUsage = {
  readonly usedTokens: number;
  readonly maxTokens: number;
  readonly modelId: string;
  readonly usage: LanguageModelUsage;
};

function emptyLanguageModelUsage(): LanguageModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: 0,
      reasoningTokens: 0,
    },
  };
}

function toContextUsage(
  usage: SessionProjection["usage"],
  fallbackModelId: string,
): ComposerContextUsage {
  return {
    usedTokens: usage.usedTokens,
    maxTokens: usage.maxTokens,
    modelId: usage.modelId ?? fallbackModelId,
    usage: (usage.usage as LanguageModelUsage | null) ?? emptyLanguageModelUsage(),
  };
}

type Listener = () => void;

export type BatchedEngine = {
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

/** Composer / status-bar actions — deliberately excludes usage (own island). */
export type AgentSessionControls = SessionControls & {
  status: SessionProjection["status"];
  failure: SessionFailure | null;
  start: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  retryFromMessage: (assistantMessageId: string) => Promise<void>;
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
    const store = storeRef.current;
    if (store === null) {
      return;
    }
    setActiveSessionEngine(store.engine);
    return () => {
      setActiveSessionEngine(null);
    };
  }, []);

  return storeRef.current;
}

/** Header chrome only — no settings Suspense; safe outside SuspenseQueryBoundary. */
export function useAgentInputDisabled(store: BatchedEngine): boolean {
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().status,
    () => store.getSnapshot().status,
  );
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

/** Hot path: only fields that affect the transcript list / Thinking marker. */
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
  const pendingPermissions = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().pendingPermissions,
    () => store.getSnapshot().pendingPermissions,
  );
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().status,
    () => store.getSnapshot().status,
  );
  const taskId = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().taskId,
    () => store.getSnapshot().taskId,
  );

  const displayRows = useMemo(
    () => deriveDisplayRows({ rows, status, taskId, streamingMessageId }),
    [rows, status, taskId, streamingMessageId],
  );

  return useMemo(
    () => ({
      rows: displayRows,
      streamingMessageId,
      pendingPermissions,
    }),
    [displayRows, streamingMessageId, pendingPermissions],
  );
}

/** Context meter only — silent on text chunks when usage identity is shared. */
export function useAgentContextUsage(store: BatchedEngine): ComposerContextUsage {
  // Field selector — secrets hydration must not wake this island.
  const selectedModelId = useSettingsSelector(selectSelectedModelId);
  const usage = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().usage,
    () => store.getSnapshot().usage,
  );
  return useMemo(() => toContextUsage(usage, selectedModelId), [usage, selectedModelId]);
}

/** Warm path: control flags + actions — no usage (keeps composer chrome cold on chunks). */
export function useAgentSessionControls(store: BatchedEngine): AgentSessionControls {
  // Field selectors — secrets hydration must not rebuild composer controls.
  const selectedModelId = useSettingsSelector(selectSelectedModelId);
  const permissionMode = useSettingsSelector(selectPermissionMode);
  const queryClient = useQueryClient();
  // mutate is referentially stable; the full mutation result object is not.
  const { mutate: mutateSettings } = useUpdateSettings();
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
      const latest = await queryClient.ensureQueryData(settingsQueryOptions());
      const { secrets: _placeholder, ...appSettings } = latest;
      if (!isLiveWorkspaceReady(appSettings)) {
        toast.error("Set a workspace root in Settings before running live.");
        return;
      }
      // Demo never needs the vault — don't stall first send on Stronghold.
      const secrets =
        appSettings.agentMode === "live" ? await ensureSecretsReady() : { ...DEFAULT_SECRETS };
      const projection = store.engine.getProjection();
      await store.engine.start({
        prompt,
        modelId: appSettings.selectedModelId,
        chatMessages: projection.chatMessages,
        settings: appSettings,
        secrets,
        persistApproval: persistToolApproval,
      });
    },
    [store, queryClient, persistToolApproval],
  );

  const cancel = useCallback(() => store.engine.cancel(), [store]);
  const retry = useCallback(() => store.engine.retry(), [store]);
  const retryFromMessage = useCallback(
    async (assistantMessageId: string) => {
      const latest = await queryClient.ensureQueryData(settingsQueryOptions());
      const { secrets: _placeholder, ...appSettings } = latest;
      if (!isLiveWorkspaceReady(appSettings)) {
        toast.error("Set a workspace root in Settings before running live.");
        return;
      }
      const secrets =
        appSettings.agentMode === "live" ? await ensureSecretsReady() : { ...DEFAULT_SECRETS };
      await store.engine.retryFromMessage(assistantMessageId, {
        modelId: appSettings.selectedModelId,
        settings: appSettings,
        secrets,
        persistApproval: persistToolApproval,
      });
    },
    [store, queryClient, persistToolApproval],
  );
  const resolvePermission = useCallback(
    (callId: string, decision: PermissionDecision, persist?: boolean) =>
      store.engine.resolvePermission(callId, decision, persist),
    [store],
  );

  const onModelChange = useCallback(
    (modelId: string) => {
      mutateSettings({ selectedModelId: modelId });
    },
    [mutateSettings],
  );

  return useMemo(
    () => ({
      ...controls,
      status,
      failure,
      start,
      cancel,
      retry,
      retryFromMessage,
      resolvePermission,
      modelId: selectedModelId,
      onModelChange,
      permissionMode,
      pendingPermissions,
    }),
    [
      controls,
      status,
      failure,
      start,
      cancel,
      retry,
      retryFromMessage,
      resolvePermission,
      selectedModelId,
      permissionMode,
      onModelChange,
      pendingPermissions,
    ],
  );
}
