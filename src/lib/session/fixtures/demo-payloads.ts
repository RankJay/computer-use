import type { RuntimeEventPayload } from "../events";
import type { ProduceRun } from "../control/run-controller";

/** Payload-only demo fixture for session-engine tests (no envelopes). */
export function createDemoPayloads(prompt: string): RuntimeEventPayload[] {
  return [
    {
      type: "activity.marker",
      markerId: "marker-today",
      variant: "separator",
      text: "Today",
    },
    {
      type: "task.started",
      prompt,
      modelId: "openai/gpt-5.4",
      agentMode: "demo",
      userMessageId: "msg-user-1",
    },
    {
      type: "activity.marker",
      markerId: "marker-thinking",
      text: "Thinking…",
      live: true,
      status: true,
    },
    {
      type: "task.status_changed",
      status: "streaming",
    },
    {
      type: "activity.chain_updated",
      chainId: "cot-1",
      steps: [
        {
          label: "Searching project for control-center files",
          status: "complete",
          searchResults: ["ControlCenter.tsx", "TaskPromptComposer.tsx"],
        },
        {
          label: "Reading settings for model defaults",
          status: "complete",
          description: "Agent mode, max steps, and provider caps loaded from saved settings.",
        },
        {
          label: "Drafting transcript row mapping",
          status: "active",
          description: "Mapping AI SDK parts to shadcn shell + AI Elements blocks.",
        },
      ],
    },
    {
      type: "activity.task_updated",
      activityTaskId: "task-1",
      title: "Found project files",
      items: [
        "Searching control-center and ai-chat directories",
        { text: "Read", file: { name: "ControlCenter.tsx" } },
        { text: "Read", file: { name: "TaskPromptComposer.tsx" } },
        "Scanning 12 candidate UI blocks",
      ],
    },
    {
      type: "assistant.message_started",
      messageId: "msg-assistant-1",
      role: "assistant",
    },
    {
      type: "assistant.part_updated",
      messageId: "msg-assistant-1",
      partIndex: 0,
      part: {
        type: "text",
        text: "Demo transcript is ready.",
      },
    },
    {
      type: "assistant.message_finished",
      messageId: "msg-assistant-1",
    },
    {
      type: "usage.updated",
      modelId: "openai/gpt-5.4",
      usedTokens: 12_400,
      maxTokens: 128_000,
    },
    {
      type: "task.completed",
      finishReason: "stop",
    },
  ];
}

/**
 * Test producer: appends payloads in order. Yields between events so cancel can abort.
 * Rewrites task.started prompt/model from config; supports omitUserMessage for retry.
 */
export function createTestDemoProducer(
  payloads: RuntimeEventPayload[] = createDemoPayloads("demo"),
): ProduceRun {
  return async ({ config, taskId, signal, append }) => {
    for (const payload of payloads) {
      if (signal.aborted) break;
      await Promise.resolve();
      if (signal.aborted) break;

      if (payload.type === "task.started") {
        append({
          ...payload,
          prompt: config.prompt,
          modelId: config.modelId,
          agentMode: "demo",
          userMessageId: config.isRetry ? undefined : `user-${taskId}`,
          omitUserMessage: config.isRetry === true,
        });
        continue;
      }

      if (payload.type === "usage.updated") {
        append({ ...payload, modelId: config.modelId });
        continue;
      }

      append(payload);
    }
  };
}
