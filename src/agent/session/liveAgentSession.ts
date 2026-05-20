import { stepCountIs, streamText } from "ai";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { getHostOsKind } from "@/agent/hostEnvironment";
import type { LlmApiProvider } from "@/agent/native/tauriIpc";
import { createLiveLanguageModel } from "@/agent/session/liveProviderModel";
import {
  emitAndPersistLiveSessionEvent,
  persistLiveSessionEvent,
} from "@/agent/session/liveSessionLogPolicy";
import {
  buildScreenshotAttachmentStep,
  shouldAttachLatestScreenshot,
} from "@/agent/session/liveScreenshotAttachment";
import { buildLivePromptBundle } from "@/agent/session/liveSystemPrompt";
import {
  assistantTextStreamTransform,
  mapStreamChunkToAgentEvent,
} from "@/agent/session/liveStreamMapping";
import {
  buildLiveCompletionEvents,
  buildTaskCreatedEvent,
  buildTaskFailedEvent,
} from "@/agent/session/liveTaskEvents";
import type { AgentSessionRunnerOptions } from "@/agent/session/sessionRunner";
import type { ConsequenceRiskClass } from "@/agent/toolContract";
import { createActuateTools } from "@/agent/tools/actuateTools";
import { createEventId } from "@/agent/types";
import { workspaceAdapter as defaultWorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type LiveAgentSessionOptions = AgentSessionRunnerOptions & {
  readonly apiKey: string;
  readonly llmProvider: LlmApiProvider;
  readonly liveModelId: string;
};

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

  const createMeta = () => ({ id: createEventId(), at: Date.now() });

  const taskEvent = buildTaskCreatedEvent(taskId, prompt, createMeta());
  await emitAndPersistLiveSessionEvent(emit, taskId, taskEvent);

  const { system, userMessage } = buildLivePromptBundle({
    nativeBridge: native !== null,
    hostOs,
    uiAutomationEnabled: settings.uiAutomationEnabled,
    workspaceRoot,
    prompt,
  });

  try {
    const result = streamText({
      model: languageModel,
      experimental_transform: assistantTextStreamTransform,
      system,
      messages: [{ role: "user", content: userMessage }],
      tools,
      stopWhen: stepCountIs(28),
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
