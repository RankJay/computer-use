import type { MandatesPersistence } from "@/lib/mandates";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RetryFromMessageConfig, SessionEngine } from "../engine";
import type { AttemptRegistry } from "./attempt-registry";
import type { PermissionDecision, RunConfig } from "./run-controller";

export type AttemptStartInput = {
  prompt: string;
  /** Absent ⇒ create a new Mandate (or reuse focused). */
  mandateId?: string;
};

export type AttemptIds = {
  mandateId: string;
  attemptId: string;
};

export type AttemptStartError = {
  ok: false;
  reason: "workspace_not_ready" | "noop";
};

export type AttemptStartOk = {
  ok: true;
} & AttemptIds;

export type AttemptStartResult = AttemptStartOk | AttemptStartError;

export type LoadedRunContext = {
  settings: AppSettings;
  secrets: AppSecrets;
  persistApproval: (capability: string) => Promise<void>;
};

export type AttemptControl = {
  start: (input: AttemptStartInput) => Promise<AttemptStartResult>;
  retry: () => Promise<AttemptStartResult>;
  retryFromMessage: (assistantMessageId: string) => Promise<AttemptStartResult>;
  cancel: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
  getFocusedMandateId: () => string | null;
  getLiveIds: () => AttemptIds | null;
  getLiveChatId: () => string | null;
  setLiveChatId: (chatId: string | null) => void;
  setFocusedMandateId: (mandateId: string | null) => void;
};

export type AttemptControlDeps = {
  engine: SessionEngine;
  registry: AttemptRegistry;
  mandates: MandatesPersistence;
  loadRunContext: () => Promise<LoadedRunContext | null>;
  waitForAttemptStarted: () => Promise<string>;
  /** Cancel a pending waitForAttemptStarted waiter (no-op start / early settle). */
  cancelAttemptStartedWait: () => void;
};

export function createAttemptControl(deps: AttemptControlDeps): AttemptControl {
  async function resolveMandateId(mandateId: string | undefined): Promise<string> {
    if (mandateId) {
      const existing = await deps.mandates.get(mandateId);
      if (existing) {
        return existing.id;
      }
    }
    const focused = deps.registry.getFocusedMandateId();
    if (focused) {
      const existing = await deps.mandates.get(focused);
      if (existing) {
        return existing.id;
      }
    }
    const created = await deps.mandates.create({ kind: "interactive" });
    return created.id;
  }

  async function beginRun(
    mandateId: string,
    start: () => Promise<void>,
  ): Promise<AttemptStartResult> {
    deps.registry.setFocusedMandateId(mandateId);
    const started = deps.waitForAttemptStarted().then((attemptId) => ({
      kind: "started" as const,
      attemptId,
    }));
    const run = start().then(
      () => ({ kind: "done" as const }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );

    const first = await Promise.race([started, run]);
    if (first.kind === "started") {
      const { attemptId } = first;
      deps.registry.setLive({ mandateId, attemptId });
      void run.finally(() => {
        const live = deps.registry.getLive();
        if (live?.attemptId === attemptId) {
          deps.registry.clearLive();
        }
      });
      return { ok: true, mandateId, attemptId };
    }

    deps.cancelAttemptStartedWait();
    if (first.kind === "error") {
      throw first.error;
    }
    return { ok: false, reason: "noop" };
  }

  return {
    getFocusedMandateId: () => deps.registry.getFocusedMandateId(),
    getLiveIds: () => deps.registry.getLive(),
    getLiveChatId: () => deps.registry.getLiveChatId(),
    setLiveChatId: (chatId) => deps.registry.setLiveChatId(chatId),
    setFocusedMandateId: (mandateId) => deps.registry.setFocusedMandateId(mandateId),

    async start(input) {
      const ctx = await deps.loadRunContext();
      if (!ctx) {
        return { ok: false, reason: "workspace_not_ready" };
      }

      const mandateId = await resolveMandateId(input.mandateId);
      const projection = deps.engine.getProjection();
      const config: RunConfig = {
        prompt: input.prompt,
        modelId: ctx.settings.selectedModelId,
        chatMessages: projection.chatMessages,
        settings: ctx.settings,
        secrets: ctx.secrets,
        persistApproval: ctx.persistApproval,
      };
      return beginRun(mandateId, () => deps.engine.start(config));
    },

    async retry() {
      const ctx = await deps.loadRunContext();
      if (!ctx) {
        return { ok: false, reason: "workspace_not_ready" };
      }
      const mandateId =
        deps.registry.getLive()?.mandateId ??
        deps.registry.getFocusedMandateId() ??
        (await resolveMandateId(undefined));
      return beginRun(mandateId, () => deps.engine.retry());
    },

    async retryFromMessage(assistantMessageId) {
      const ctx = await deps.loadRunContext();
      if (!ctx) {
        return { ok: false, reason: "workspace_not_ready" };
      }
      const mandateId = deps.registry.getFocusedMandateId() ?? (await resolveMandateId(undefined));
      const pack: RetryFromMessageConfig = {
        modelId: ctx.settings.selectedModelId,
        settings: ctx.settings,
        secrets: ctx.secrets,
        persistApproval: ctx.persistApproval,
      };
      return beginRun(mandateId, () => deps.engine.retryFromMessage(assistantMessageId, pack));
    },

    cancel: () => deps.engine.cancel(),

    resolvePermission: (callId, decision, persist) =>
      deps.engine.resolvePermission(callId, decision, persist),
  };
}
