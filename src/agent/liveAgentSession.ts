import { createAnthropic } from "@ai-sdk/anthropic";
import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http";
import { stepCountIs, streamText } from "ai";
import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { createActuateTools } from "@/agent/aiTools";
import { describeRuntimeCapabilities, getHostOsKind } from "@/agent/hostEnvironment";
import type { AgentSessionRunnerOptions } from "@/agent/sessionRunner";
import { appendSessionLogLine, persistKeyframePng } from "@/agent/sessionLogs";
import { createEventId } from "@/agent/types";
import type { AgentEvent } from "@/agent/types";
import type { ConsequenceRiskClass } from "@/agent/toolContract";

export type LiveAgentSessionOptions = AgentSessionRunnerOptions & {
  readonly apiKey: string;
};

async function appendStructuredLog(taskId: string, event: AgentEvent): Promise<void> {
  await appendSessionLogLine(taskId, event);
  if (event.type === "screenshot.keyframe" && event.imageBase64) {
    const fn = `${createEventId()}.png`;
    await persistKeyframePng(taskId, fn, event.imageBase64);
  }
}

export async function runLiveAgentSession(options: LiveAgentSessionOptions): Promise<void> {
  const {
    taskId,
    prompt,
    apiKey,
    settings,
    workspaceRoot,
    permissionMode,
    native,
    emit,
    waitForPermissionChoice,
    persistAlwaysAllow,
  } = options;

  const hostOs = getHostOsKind();
  const persisted = new Set(settings.persistedApprovals);
  const sessionRiskApproved = new Set<ConsequenceRiskClass>();

  const ctx: LiveAgentToolContext = {
    taskId,
    native,
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
    appendStructuredLog: (e) => appendStructuredLog(taskId, e),
  };

  const tools = createActuateTools(ctx);
  const anthropic = createAnthropic({
    apiKey,
    headers: {
      "anthropic-dangerous-direct-browser-access": "true",
    },
    ...(native !== null ? { fetch: tauriHttpFetch } : {}),
  });

  const taskEvent: AgentEvent = {
    id: createEventId(),
    at: Date.now(),
    taskId,
    type: "task.created",
    prompt,
  };
  emit(taskEvent);
  await appendStructuredLog(taskId, taskEvent);

  const workspaceLine =
    workspaceRoot && workspaceRoot.length > 0
      ? workspaceRoot
      : "(workspace not set — set in Settings)";
  const capabilitiesLine = describeRuntimeCapabilities({
    nativeBridge: native !== null,
    hostOs,
  });
  const userMessage = `${capabilitiesLine}

Workspace root: ${workspaceLine}

User task:
${prompt}`;

  try {
    const result = streamText({
      model: anthropic(settings.modelId),
      system: [
        "You are Actuate, a local desktop agent. Prefer tools over guessing for machine state (files, terminal, screenshots).",
        "Answer concisely in natural language.",
        "Never use emojis.",
        capabilitiesLine,
        "If workspace root is unset, file listing/reading may fail—use terminal_run on absolute paths when the desktop app and native tools are available.",
        "Enable UI automation tools only when the user goal clearly requires clicking, mouse moves, or typing.",
      ].join(" "),
      messages: [{ role: "user", content: userMessage }],
      tools,
      stopWhen: stepCountIs(28),
      prepareStep: async ({ stepNumber }) => {
        const img = ctx.vision.latestPng;
        if (!img || stepNumber < 2) {
          return {};
        }
        ctx.vision.latestPng = null;
        return {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Attached: latest primary-display PNG for visual reasoning.",
                },
                {
                  type: "image",
                  image: `data:image/png;base64,${img}`,
                },
              ],
            },
          ],
        };
      },
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta") {
          const ev: AgentEvent = {
            id: createEventId(),
            at: Date.now(),
            taskId,
            type: "assistant.text.delta",
            text: chunk.text,
          };
          emit(ev);
        }
      },
    });

    await result.consumeStream();
    const text = (await result.text).trim();

    const doneEv: AgentEvent = {
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "assistant.text.done",
    };
    emit(doneEv);
    await appendStructuredLog(taskId, doneEv);

    const summary =
      text.length > 0
        ? text.slice(0, 8000)
        : "Model run finished with no textual summary (tools may have executed).";
    const completeEv: AgentEvent = {
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "task.completed",
      summary,
    };
    emit(completeEv);
    await appendStructuredLog(taskId, completeEv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failEv: AgentEvent = {
      id: createEventId(),
      at: Date.now(),
      taskId,
      type: "task.failed",
      message,
    };
    emit(failEv);
    await appendStructuredLog(taskId, failEv);
  }
}
