import { streamText } from "ai";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { getHostOsKind } from "@/agent/hostEnvironment";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { createLiveLanguageModel } from "@/agent/session/liveProviderModel";
import {
  buildScreenshotAttachmentStep,
  shouldAttachLatestScreenshot,
} from "@/agent/session/liveScreenshotAttachment";
import {
  emitAndPersistLiveSessionEvent,
  persistLiveSessionEvent,
} from "@/agent/session/liveSessionLogPolicy";
import {
  addUsageSnapshots,
  createEmptyUsageSnapshot,
  extractUsageSnapshotFromStreamChunk,
  mapStreamChunkToAgentEvent,
  mapUsageDeltaToAgentEvent,
  mergeUsageSnapshot,
  type StreamUsageSnapshot,
  usageSnapshotDelta,
} from "@/agent/session/liveStreamMapping";
import { buildLivePromptBundle } from "@/agent/session/liveSystemPrompt";
import {
  buildLiveCompletionEvents,
  buildTaskCreatedEvent,
  buildTaskFailedEvent,
} from "@/agent/session/liveTaskEvents";
import { createRunBudgetProgress, exceededBudgetLimit } from "@/agent/session/runBudget";
import type { AgentSessionRunnerOptions } from "@/agent/session/sessionRunner";
import type { ConsequenceRiskClass } from "@/agent/toolContract";
import { createActuateTools } from "@/agent/tools/actuateTools";
import { createEventId, type RunBudgetLimit, type RunBudgetProgress } from "@/agent/types";
import { workspaceAdapter as defaultWorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type LiveAgentSessionOptions = AgentSessionRunnerOptions & {
  readonly apiKey: string;
  readonly llmProvider: LlmApiProvider;
  readonly liveModelId: string;
};

type BudgetStep = Parameters<typeof createRunBudgetProgress>[0]["steps"][number];

function createMeta(): { readonly id: string; readonly at: number } {
  return { id: createEventId(), at: Date.now() };
}

export async function runLiveAgentSession(options: LiveAgentSessionOptions): Promise<void> {
  const {
    taskId,
    prompt,
    apiKey,
    llmProvider,
    liveModelId,
    settings,
    workspaceRoot,
    permissionMode,
    native,
    workspaceAdapter: workspaceAdapterOverride,
    emit,
    waitForPermissionChoice,
    persistAlwaysAllow,
  } = options;
  const workspaceFilesAdapter = workspaceAdapterOverride ?? defaultWorkspaceAdapter;

  const hostOs = getHostOsKind();
  const persisted = new Set(settings.persistedApprovals);
  const sessionRiskApproved = new Set<ConsequenceRiskClass>();
  const runBudget = options.runBudgetOverride ?? settings.runBudgetDefaults;
  const budgetStartedAt = Date.now();
  let budgetExceededLimit: RunBudgetLimit | null = null;
  let finishedSteps: BudgetStep[] = [];
  let committedUsage = createEmptyUsageSnapshot();
  let currentStepUsage = createEmptyUsageSnapshot();
  let emittedUsage = createEmptyUsageSnapshot();

  const ctx: LiveAgentToolContext = {
    taskId,
    native,
    workspaceFiles: workspaceFilesAdapter,
    hostOs,
    workspaceRoot,
    permissionMode,
    uiAutomationEnabled: settings.uiAutomationEnabled,
    persistedToolApprovals: persisted,
    sessionRiskApproved,
    vision: { latestPng: null },
    emit,
    waitForPermission: waitForPermissionChoice,
    persistAlwaysAllow,
    appendStructuredLog: (e) => persistLiveSessionEvent(taskId, e),
  };

  const tools = createActuateTools(ctx);

  const languageModel = createLiveLanguageModel({
    apiKey,
    llmProvider,
    liveModelId,
    useTauriHttp: native !== null,
  });

  const taskEvent = buildTaskCreatedEvent(taskId, prompt, createMeta());
  await emitAndPersistLiveSessionEvent(emit, taskId, taskEvent);

  const { system, userMessage } = buildLivePromptBundle({
    nativeBridge: native !== null,
    hostOs,
    uiAutomationEnabled: settings.uiAutomationEnabled,
    workspaceRoot,
    prompt,
  });

  async function recordBudgetProgress(steps: readonly BudgetStep[]): Promise<RunBudgetProgress> {
    const progress = createRunBudgetProgress({
      budget: runBudget,
      steps,
      provider: llmProvider,
      modelId: liveModelId,
      startedAt: budgetStartedAt,
      now: Date.now(),
    });
    await emitAndPersistLiveSessionEvent(emit, taskId, {
      ...createMeta(),
      taskId,
      type: "agent.budget.delta",
      progress,
    });

    const limit = exceededBudgetLimit(progress);
    if (limit !== null && budgetExceededLimit === null) {
      budgetExceededLimit = limit;
      await emitAndPersistLiveSessionEvent(emit, taskId, {
        ...createMeta(),
        taskId,
        type: "agent.budget.exceeded",
        limit,
        progress,
      });
    }
    return progress;
  }

  function recordUsageSnapshot(usageSnapshot: StreamUsageSnapshot): void {
    const nextUsage =
      usageSnapshot.scope === "run"
        ? mergeUsageSnapshot(emittedUsage, usageSnapshot.usage)
        : addUsageSnapshots(
            committedUsage,
            mergeUsageSnapshot(currentStepUsage, usageSnapshot.usage),
          );
    const usageDelta = usageSnapshotDelta(nextUsage, emittedUsage);
    const usageEvent = mapUsageDeltaToAgentEvent(
      usageDelta,
      taskId,
      llmProvider,
      liveModelId,
      createMeta,
    );

    if (usageEvent !== null) {
      emit(usageEvent);
      emittedUsage = addUsageSnapshots(emittedUsage, usageDelta);
    }

    if (usageSnapshot.scope === "step") {
      currentStepUsage = mergeUsageSnapshot(currentStepUsage, usageSnapshot.usage);
    }
  }

  function commitCurrentStepUsage(): void {
    committedUsage = addUsageSnapshots(committedUsage, currentStepUsage);
    currentStepUsage = createEmptyUsageSnapshot();
  }

  try {
    const result = streamText({
      model: languageModel,
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      includeRawChunks: true,
      providerOptions:
        llmProvider === "openai"
          ? {
              openai: {
                streamOptions: { includeUsage: true },
              },
            }
          : undefined,
      stopWhen: [
        ({ steps }) => {
          const progress = createRunBudgetProgress({
            budget: runBudget,
            steps,
            provider: llmProvider,
            modelId: liveModelId,
            startedAt: budgetStartedAt,
            now: Date.now(),
          });
          const limit = exceededBudgetLimit(progress);
          if (limit !== null) {
            return true;
          }
          return false;
        },
      ],
      prepareStep: async ({ stepNumber }) => {
        const img = ctx.vision.latestPng;
        if (!shouldAttachLatestScreenshot(img, stepNumber)) {
          return {};
        }
        ctx.vision.latestPng = null;
        return buildScreenshotAttachmentStep(img);
      },
      onChunk: async ({ chunk }) => {
        const ev = mapStreamChunkToAgentEvent(chunk, taskId, createMeta);
        if (ev) {
          emit(ev);
        }

        const usageSnapshot = extractUsageSnapshotFromStreamChunk(chunk);
        if (usageSnapshot !== null) {
          recordUsageSnapshot(usageSnapshot);
        }
      },
      onStepFinish: async (step) => {
        finishedSteps = [...finishedSteps, step];
        await recordBudgetProgress(finishedSteps);

        const usageSnapshot = extractUsageSnapshotFromStreamChunk({
          type: "finish-step",
          usage: step.usage,
        });
        if (usageSnapshot !== null) {
          recordUsageSnapshot(usageSnapshot);
          commitCurrentStepUsage();
        }
      },
    });

    await result.consumeStream();
    const text = (await result.text).trim();

    const { done, completed } = buildLiveCompletionEvents(taskId, text, createMeta);
    await emitAndPersistLiveSessionEvent(emit, taskId, done);
    await emitAndPersistLiveSessionEvent(emit, taskId, completed);
  } catch (err) {
    const failEv = buildTaskFailedEvent(taskId, err, createMeta());
    await emitAndPersistLiveSessionEvent(emit, taskId, failEv);
  }
}
