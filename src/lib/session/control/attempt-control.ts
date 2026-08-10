import type { EntitlementPolicy } from "@/lib/entitlements";
import type { MandatesPersistence } from "@/lib/mandates";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RetryFromMessageConfig, AttemptEngine } from "../engine";
import { foldModelContext } from "../model-context";
import { noopAttemptLifecyclePort, type AttemptLifecyclePort } from "./attempt-lifecycle-port";
import { resolveAttemptSettleEvent } from "./attempt-lifecycle-settle";
import type { AttemptRegistry } from "./attempt-registry";
import type { ResolveInteraction, RunConfig } from "./run-controller";

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
  reason:
    | "workspace_not_ready"
    | "noop"
    | "entitlement_denied"
    | "require_upgrade"
    | "concurrency_reject";
  message?: string;
  feature?: string;
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
  resolve: (interaction: ResolveInteraction) => Promise<void>;
  getFocusedMandateId: () => string | null;
  getLiveIds: () => AttemptIds | null;
  getLiveChatId: () => string | null;
  setLiveChatId: (chatId: string | null) => void;
  setFocusedMandateId: (mandateId: string | null) => void;
};

export type AttemptControlDeps = {
  engine: AttemptEngine;
  registry: AttemptRegistry;
  mandates: MandatesPersistence;
  loadRunContext: () => Promise<LoadedRunContext | null>;
  waitForAttemptStarted: () => Promise<string>;
  /** Cancel a pending waitForAttemptStarted waiter (no-op start / early settle). */
  cancelAttemptStartedWait: () => void;
  /** Commercial gate; optional so unit tests can omit. */
  entitlements?: EntitlementPolicy;
  /** Product analytics seam; defaults to no-op. */
  lifecyclePort?: AttemptLifecyclePort;
};

function entitlementStartError(decision: {
  outcome: "deny" | "require_upgrade";
  reason: string;
  feature?: string;
}): AttemptStartError {
  if (decision.outcome === "require_upgrade") {
    return {
      ok: false,
      reason: "require_upgrade",
      message: decision.reason,
      feature: decision.feature,
    };
  }
  return {
    ok: false,
    reason: "entitlement_denied",
    message: decision.reason,
    feature: decision.feature,
  };
}

export function createAttemptControl(deps: AttemptControlDeps): AttemptControl {
  const lifecycle = deps.lifecyclePort ?? noopAttemptLifecyclePort;
  const armedStarts = new Map<string, number>();

  function emitBlocked(result: AttemptStartError): void {
    switch (result.reason) {
      case "entitlement_denied":
      case "require_upgrade":
      case "concurrency_reject":
      case "workspace_not_ready":
        lifecycle.notify({
          type: "blocked",
          reason: result.reason,
          capability: result.feature,
        });
        return;
      case "noop":
        return;
      default: {
        const _exhaustive: never = result.reason;
        return _exhaustive;
      }
    }
  }

  function returnStartResult(result: AttemptStartResult): AttemptStartResult {
    if (!result.ok) {
      emitBlocked(result);
    }
    return result;
  }

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

  async function authorizeStart(modelId: string): Promise<AttemptStartError | null> {
    const policy = deps.entitlements;
    if (!policy) {
      return null;
    }

    const modelDecision = await policy.authorize({ kind: "model", modelId });
    if (modelDecision.outcome === "deny" || modelDecision.outcome === "require_upgrade") {
      return entitlementStartError(modelDecision);
    }

    const attemptDecision = await policy.authorize({ kind: "attempt_start" }, { commit: false });
    if (attemptDecision.outcome === "deny" || attemptDecision.outcome === "require_upgrade") {
      return entitlementStartError(attemptDecision);
    }

    return null;
  }

  async function commitAttemptStartMeter(): Promise<AttemptStartError | null> {
    const policy = deps.entitlements;
    if (!policy) {
      return null;
    }
    const attemptDecision = await policy.authorize({ kind: "attempt_start" }, { commit: true });
    if (attemptDecision.outcome === "deny" || attemptDecision.outcome === "require_upgrade") {
      return entitlementStartError(attemptDecision);
    }
    return null;
  }

  function authorizeConcurrency(mandateId: string): AttemptStartError | null {
    const decision = deps.registry.getConcurrencyPolicy().onConflict({
      live: deps.registry.getLive(),
      incomingMandateId: mandateId,
    });
    switch (decision) {
      case "cancel_previous":
        return null;
      case "reject":
        return {
          ok: false,
          reason: "concurrency_reject",
          message: "Another attempt is already running.",
        };
      default: {
        const _exhaustive: never = decision;
        return _exhaustive;
      }
    }
  }

  async function beginRun(
    mandateId: string,
    modelId: string,
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
      const meterBlocked = await commitAttemptStartMeter();
      if (meterBlocked) {
        deps.cancelAttemptStartedWait();
        await deps.engine.cancel();
        return returnStartResult(meterBlocked);
      }
      deps.registry.setLive({ mandateId, attemptId });
      const startedAt = Date.now();
      armedStarts.set(attemptId, startedAt);
      lifecycle.notify({ type: "started", attemptId, model: modelId });
      void run.finally(() => {
        const live = deps.registry.getLive();
        if (live?.attemptId === attemptId) {
          deps.registry.clearLive();
        }
        const armedAt = armedStarts.get(attemptId);
        if (armedAt === undefined) {
          return;
        }
        armedStarts.delete(attemptId);
        const duration_ms = Math.max(0, Date.now() - armedAt);
        lifecycle.notify(
          resolveAttemptSettleEvent(attemptId, deps.engine.getEventLog(), duration_ms),
        );
      });
      return { ok: true, mandateId, attemptId };
    }

    deps.cancelAttemptStartedWait();
    if (first.kind === "error") {
      throw first.error;
    }
    return returnStartResult({ ok: false, reason: "noop" });
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
        return returnStartResult({ ok: false, reason: "workspace_not_ready" });
      }

      const blocked = await authorizeStart(ctx.settings.selectedModelId);
      if (blocked) {
        return returnStartResult(blocked);
      }

      const mandateId = await resolveMandateId(input.mandateId);
      const concurrencyBlocked = authorizeConcurrency(mandateId);
      if (concurrencyBlocked) {
        return returnStartResult(concurrencyBlocked);
      }
      const mandate = await deps.mandates.get(mandateId);
      await deps.mandates.update(mandateId, { status: "running" });
      const execution = foldModelContext(deps.engine.getProjection());
      const config: RunConfig = {
        prompt: input.prompt,
        modelId: ctx.settings.selectedModelId,
        chatMessages: execution.messages,
        settings: ctx.settings,
        secrets: ctx.secrets,
        persistApproval: ctx.persistApproval,
        standingPolicy: mandate?.standingPolicy ?? null,
      };
      return beginRun(mandateId, config.modelId, () => deps.engine.start(config));
    },

    async retry() {
      const ctx = await deps.loadRunContext();
      if (!ctx) {
        return returnStartResult({ ok: false, reason: "workspace_not_ready" });
      }
      const blocked = await authorizeStart(ctx.settings.selectedModelId);
      if (blocked) {
        return returnStartResult(blocked);
      }
      const mandateId =
        deps.registry.getLive()?.mandateId ??
        deps.registry.getFocusedMandateId() ??
        (await resolveMandateId(undefined));
      const concurrencyBlocked = authorizeConcurrency(mandateId);
      if (concurrencyBlocked) {
        return returnStartResult(concurrencyBlocked);
      }
      await deps.mandates.update(mandateId, { status: "running" });
      return beginRun(mandateId, ctx.settings.selectedModelId, () => deps.engine.retry());
    },

    async retryFromMessage(assistantMessageId) {
      const ctx = await deps.loadRunContext();
      if (!ctx) {
        return returnStartResult({ ok: false, reason: "workspace_not_ready" });
      }
      const blocked = await authorizeStart(ctx.settings.selectedModelId);
      if (blocked) {
        return returnStartResult(blocked);
      }
      const mandateId = deps.registry.getFocusedMandateId() ?? (await resolveMandateId(undefined));
      const concurrencyBlocked = authorizeConcurrency(mandateId);
      if (concurrencyBlocked) {
        return returnStartResult(concurrencyBlocked);
      }
      const mandate = await deps.mandates.get(mandateId);
      await deps.mandates.update(mandateId, { status: "running" });
      const pack: RetryFromMessageConfig = {
        modelId: ctx.settings.selectedModelId,
        settings: ctx.settings,
        secrets: ctx.secrets,
        persistApproval: ctx.persistApproval,
        standingPolicy: mandate?.standingPolicy ?? null,
      };
      return beginRun(mandateId, pack.modelId, () =>
        deps.engine.retryFromMessage(assistantMessageId, pack),
      );
    },

    cancel: () => deps.engine.cancel(),

    resolve: (interaction) => deps.engine.resolve(interaction),
  };
}
