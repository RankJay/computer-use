import type { LanguageModelUsage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSettingsActions, useSettingsState } from "@/app/providers/SettingsProvider";
import type { TaskPromptComposerContextUsage } from "@/features/control-center/TaskPromptComposer";
import {
  createEmptySessionProjection,
  createDefaultRunController,
  demoRunEvents,
  projectSessionIncremental,
  type SessionProjection,
} from "@/lib/session";
import { createEventBus, type EventBus } from "@/lib/session/transport/event-bus";

export type UseAgentRunResult = {
  projection: SessionProjection;
  contextUsage: TaskPromptComposerContextUsage;
  submit: (prompt: string, modelId: string) => Promise<void>;
  cancel: () => Promise<void>;
  resolvePermission: (decision: "approved" | "denied", persist?: boolean) => Promise<void>;
  ready: boolean;
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
  projection: SessionProjection,
  fallbackModelId: string,
): TaskPromptComposerContextUsage {
  return {
    usedTokens: projection.usage.usedTokens,
    maxTokens: projection.usage.maxTokens,
    modelId: projection.usage.modelId ?? fallbackModelId,
    usage: (projection.usage.usage as LanguageModelUsage | null) ?? emptyLanguageModelUsage(),
  };
}

export function useAgentRun(fallbackModelId: string): UseAgentRunResult {
  const { ready, settings } = useSettingsState();
  const { persistToolApproval } = useSettingsActions();
  const [projection, setProjection] = useState(createEmptySessionProjection);
  const projectionRef = useRef(projection);
  projectionRef.current = projection;

  const sessionRef = useRef<{
    bus: EventBus;
    controller: ReturnType<typeof createDefaultRunController>;
  } | null>(null);

  if (!sessionRef.current) {
    const bus = createEventBus();
    sessionRef.current = {
      bus,
      controller: createDefaultRunController(bus, demoRunEvents),
    };
  }

  useEffect(() => {
    const { bus } = sessionRef.current!;
    return bus.subscribe((event) => {
      setProjection((previous) => projectSessionIncremental(previous, event));
    });
  }, []);

  const contextUsage = useMemo(
    () => toContextUsage(projection, fallbackModelId),
    [projection, fallbackModelId],
  );

  const submit = useCallback(
    async (prompt: string, modelId: string) => {
      if (!ready) return;

      const { secrets, ...appSettings } = settings;
      await sessionRef.current!.controller.start({
        prompt,
        modelId,
        chatMessages: projectionRef.current.chatMessages,
        settings: appSettings,
        secrets,
      });
    },
    [ready, settings],
  );

  const cancel = useCallback(async () => {
    await sessionRef.current!.controller.cancel();
  }, []);

  const resolvePermission = useCallback(
    async (decision: "approved" | "denied", persist?: boolean) => {
      const pending = projectionRef.current.pendingPermission;
      if (!pending) return;

      await sessionRef.current!.controller.resolvePermission(pending.callId, decision, persist);

      if (decision === "approved" && persist) {
        await persistToolApproval(pending.capability);
      }
    },
    [persistToolApproval],
  );

  return {
    projection,
    contextUsage,
    submit,
    cancel,
    resolvePermission,
    ready,
  };
}
