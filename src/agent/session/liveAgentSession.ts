import { streamText, type ModelMessage } from "ai";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { getHostOsKind } from "@/agent/hostEnvironment";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import {
  buildContinuationMessage,
  MAX_COMPLETION_CONTINUATIONS,
  verifyCompletion,
} from "@/agent/session/liveCompletionVerifier";
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
  extractUsageSnapshotFromStreamChunk,
  mapStreamChunkToAgentEvent,
} from "@/agent/session/liveStreamMapping";
import { buildLivePromptBundle } from "@/agent/session/liveSystemPrompt";
import {
  buildLiveCompletionEvents,
  buildTaskCancelledEvent,
  buildTaskCreatedEvent,
  buildTaskFailedEvent,
} from "@/agent/session/liveTaskEvents";
import { createLiveUsageAccumulator } from "@/agent/session/liveUsageAccumulator";
import { createRunBudgetProgress, exceededBudgetLimit } from "@/agent/session/runBudget";
import type { AgentSessionRunnerOptions } from "@/agent/session/sessionRunner";
import type { ConsequenceRiskClass } from "@/agent/toolContract";
import { createActuateTools } from "@/agent/tools/actuateTools";
import {
  isCancellationError,
  TOOL_CANCELLED_REASON,
  throwIfAborted,
} from "@/agent/tools/toolCancellation";
import { createUiAutomationRunState } from "@/agent/tools/uiAutomationState";
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

function completionSummaryForVerifierResult(options: {
  readonly assistantText: string;
  readonly status: "complete" | "blocked" | "handoff" | "max_continuations";
  readonly reason: string;
}): string {
  if (options.status === "complete") {
    return options.assistantText;
  }
  const label =
    options.status === "max_continuations"
      ? "Stopped after continuation limit"
      : options.status === "blocked"
        ? "Blocked"
        : "Ready for user handoff";
  return options.assistantText.length > 0
    ? `${options.assistantText}\n\n${label}: ${options.reason}`
    : `${label}: ${options.reason}`;
}

export async function runLiveAgentSession(options: LiveAgentSessionOptions): Promise<void> {
  const {
    taskId,
    prompt,
    conversationTimeline,
    apiKey,
    llmProvider,
    liveModelId,
    settings,
    workspaceRoot,
    abortSignal,
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
  const finishedSteps: BudgetStep[] = [];
  const usageAccumulator = createLiveUsageAccumulator({
    provider: llmProvider,
    modelId: liveModelId,
  });

  const ctx: LiveAgentToolContext = {
    taskId,
    native,
    workspaceFiles: workspaceFilesAdapter,
    hostOs,
    workspaceRoot,
    signal: abortSignal,
    permissionMode,
    uiAutomationEnabled: settings.uiAutomationEnabled,
    persistedToolApprovals: persisted,
    sessionRiskApproved,
    vision: { latestCapture: null },
    uiAutomation: createUiAutomationRunState(),
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

  const { system, messages: initialMessages } = buildLivePromptBundle({
    nativeBridge: native !== null,
    hostOs,
    uiAutomationEnabled: settings.uiAutomationEnabled,
    workspaceRoot,
    conversationTimeline,
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

  try {
    throwIfAborted(abortSignal);
    const messages: ModelMessage[] = [...initialMessages];
    let completionText = "";
    let continuationCount = 0;

    while (true) {
      const result = streamText({
        model: languageModel,
        system,
        messages,
        tools,
        abortSignal,
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
          const capture = ctx.vision.latestCapture;
          if (!shouldAttachLatestScreenshot(capture, stepNumber)) {
            return {};
          }
          ctx.vision.latestCapture = null;
          return buildScreenshotAttachmentStep(capture);
        },
        onChunk: async ({ chunk }) => {
          const ev = mapStreamChunkToAgentEvent(chunk, taskId, createMeta);
          if (ev) {
            emit(ev);
          }

          const usageSnapshot = extractUsageSnapshotFromStreamChunk(chunk);
          if (usageSnapshot !== null) {
            const usageDelta = usageAccumulator.ingest(usageSnapshot);
            if (usageDelta !== null) {
              emit({
                ...createMeta(),
                taskId,
                type: "usage.delta",
                delta: usageDelta,
              });
            }
          }
        },
        onStepFinish: async (step) => {
          finishedSteps.push(step);
          await recordBudgetProgress(finishedSteps);

          const usageSnapshot = extractUsageSnapshotFromStreamChunk({
            type: "finish-step",
            usage: step.usage,
          });
          if (usageSnapshot !== null) {
            const usageDelta = usageAccumulator.ingest(usageSnapshot);
            if (usageDelta !== null) {
              emit({
                ...createMeta(),
                taskId,
                type: "usage.delta",
                delta: usageDelta,
              });
            }
          }
          usageAccumulator.commitStep();
        },
      });

      // eslint-disable-next-line no-await-in-loop -- Each agent turn must finish streaming before verification.
      await result.consumeStream();
      throwIfAborted(abortSignal);
      // eslint-disable-next-line no-await-in-loop -- Result text/response resolve together after each sequential turn.
      const [text, response] = await Promise.all([result.text, result.response]);
      messages.push(...response.messages);
      const assistantText = text.trim();

      // eslint-disable-next-line no-await-in-loop -- Verifier runs only after the prior turn completes.
      const verdict = await verifyCompletion({
        model: languageModel,
        messages,
        objective: prompt,
        assistantText,
        continuationCount,
        abortSignal,
      });

      if (verdict.status === "complete") {
        completionText = completionSummaryForVerifierResult({
          assistantText,
          status: verdict.status,
          reason: verdict.reason,
        });
        break;
      }

      if (verdict.status === "blocked" || verdict.status === "handoff") {
        completionText = completionSummaryForVerifierResult({
          assistantText,
          status: verdict.status,
          reason: verdict.reason,
        });
        break;
      }

      if (continuationCount >= MAX_COMPLETION_CONTINUATIONS || budgetExceededLimit !== null) {
        completionText = completionSummaryForVerifierResult({
          assistantText,
          status: "max_continuations",
          reason: verdict.reason,
        });
        break;
      }

      continuationCount += 1;
      messages.push(buildContinuationMessage(verdict));
    }

    const { done, completed } = buildLiveCompletionEvents(taskId, completionText, createMeta);
    await emitAndPersistLiveSessionEvent(emit, taskId, done);
    await emitAndPersistLiveSessionEvent(emit, taskId, completed);
  } catch (err) {
    if (abortSignal.aborted || isCancellationError(err)) {
      const cancelledEv = buildTaskCancelledEvent(taskId, TOOL_CANCELLED_REASON, createMeta());
      await emitAndPersistLiveSessionEvent(emit, taskId, cancelledEv);
      return;
    }
    const failEv = buildTaskFailedEvent(taskId, err, createMeta());
    await emitAndPersistLiveSessionEvent(emit, taskId, failEv);
  }
}
