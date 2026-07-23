import type { LanguageModelUsage } from "ai";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAttemptHost } from "@/app/providers/AttemptHostProvider";
import {
  deriveAttemptControls,
  deriveDisplayRows,
  type AgentTranscriptRow,
  type AttemptControls,
  type AttemptFailure,
  type BatchedAttemptStore,
  type MandateProjection,
  type PendingPermission,
  type PermissionDecision,
} from "@/lib/session";
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
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
  usage: MandateProjection["usage"],
  fallbackModelId: string,
): ComposerContextUsage {
  return {
    usedTokens: usage.usedTokens,
    maxTokens: usage.maxTokens,
    modelId: usage.modelId ?? fallbackModelId,
    usage: (usage.usage as LanguageModelUsage | null) ?? emptyLanguageModelUsage(),
  };
}

export type AgentTranscriptSlice = {
  rows: readonly AgentTranscriptRow[];
  streamingMessageId: string | null;
  pendingPermissions: readonly PendingPermission[];
};

/** Composer / status-bar actions — deliberately excludes usage (own island). */
export type AgentSessionControls = AttemptControls & {
  status: MandateProjection["status"];
  failure: AttemptFailure | null;
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
  onModelChange: (modelId: string) => void | Promise<void>;
  permissionMode: PermissionMode;
  pendingPermissions: readonly PendingPermission[];
};

/** App-runtime host store — survives Home unmount / route changes. */
export function useAgentSessionStore(): BatchedAttemptStore {
  return useAttemptHost();
}

/** Header chrome only — no settings Suspense; safe outside SuspenseQueryBoundary. */
export function useAgentInputDisabled(store: BatchedAttemptStore): boolean {
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().status,
    () => store.getMandateProjection().status,
  );
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

/** Hot path: only fields that affect the transcript list / Thinking marker. */
export function useAgentTranscript(store: BatchedAttemptStore): AgentTranscriptSlice {
  const rows = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().rows,
    () => store.getMandateProjection().rows,
  );
  const streamingMessageId = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().streamingMessageId,
    () => store.getMandateProjection().streamingMessageId,
  );
  const pendingPermissions = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().pendingPermissions,
    () => store.getMandateProjection().pendingPermissions,
  );
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().status,
    () => store.getMandateProjection().status,
  );
  const taskId = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().taskId,
    () => store.getMandateProjection().taskId,
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
export function useAgentContextUsage(store: BatchedAttemptStore): ComposerContextUsage {
  const selectedModelId = useSettingsSelector(selectSelectedModelId);
  const usage = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().usage,
    () => store.getMandateProjection().usage,
  );
  return useMemo(() => toContextUsage(usage, selectedModelId), [usage, selectedModelId]);
}

/** Warm path: control flags + actions — packing lives in AttemptControl. */
export function useAgentSessionControls(store: BatchedAttemptStore): AgentSessionControls {
  const selectedModelId = useSettingsSelector(selectSelectedModelId);
  const permissionMode = useSettingsSelector(selectPermissionMode);
  const { mutate: mutateSettings } = useUpdateSettings();

  const status = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().status,
    () => store.getMandateProjection().status,
  );
  const failure = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().failure,
    () => store.getMandateProjection().failure,
  );
  const pendingPermissions = useSyncExternalStore(
    store.subscribe,
    () => store.getMandateProjection().pendingPermissions,
    () => store.getMandateProjection().pendingPermissions,
  );

  const controls = useMemo(
    () =>
      deriveAttemptControls({
        ...store.getMandateProjection(),
        status,
        failure,
        pendingPermissions,
      }),
    [store, status, failure, pendingPermissions],
  );

  const toastStartError = useCallback((result: { ok: false; reason: string; message?: string }) => {
    if (result.reason === "workspace_not_ready") {
      toast.error("Set a workspace root in Settings before running live.");
      return;
    }
    if (result.reason === "require_upgrade") {
      toast.error(result.message ?? "Upgrade required for this action.");
      return;
    }
    if (result.reason === "entitlement_denied") {
      toast.error(result.message ?? "This action is not available on your plan.");
    }
  }, []);

  const start = useCallback(
    async (prompt: string) => {
      const result = await store.control.start({
        prompt,
        mandateId: store.control.getFocusedMandateId() ?? undefined,
      });
      if (!result.ok) {
        toastStartError(result);
      }
    },
    [store, toastStartError],
  );

  const cancel = useCallback(() => store.control.cancel(), [store]);
  const retry = useCallback(async () => {
    const result = await store.control.retry();
    if (!result.ok) {
      toastStartError(result);
    }
  }, [store, toastStartError]);
  const retryFromMessage = useCallback(
    async (assistantMessageId: string) => {
      const result = await store.control.retryFromMessage(assistantMessageId);
      if (!result.ok) {
        toastStartError(result);
      }
    },
    [store, toastStartError],
  );
  const resolvePermission = useCallback(
    (callId: string, decision: PermissionDecision, persist?: boolean) =>
      store.control.resolvePermission(callId, decision, persist),
    [store],
  );

  const onModelChange = useCallback(
    async (modelId: string) => {
      const decision = await store.entitlements?.authorize({ kind: "model", modelId });
      if (decision?.outcome === "require_upgrade" || decision?.outcome === "deny") {
        toast.error(decision.reason);
        return;
      }
      mutateSettings({ selectedModelId: modelId });
    },
    [mutateSettings, store],
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
