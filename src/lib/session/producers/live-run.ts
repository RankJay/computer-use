import type { UIMessage } from "ai";

import { runAgentLoop } from "@/lib/agent/run-agent";

import type { ProduceRun } from "../control/run-controller";

/** Live producer — wires tools via CapabilityRunner (Phase 3). */
export function createLiveRunProducer(): ProduceRun {
  return async ({
    config,
    taskId,
    signal,
    append,
    escalationPort,
    entitlements,
    osLease,
    standingPolicy,
  }) => {
    const workspaceRoot = config.settings.workspaceRoot;

    if (!config.isRetry) {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        userMessageId: `user-${taskId}`,
      });
    } else {
      append({
        type: "task.started",
        prompt: config.prompt,
        modelId: config.modelId,
        agentMode: "live",
        omitUserMessage: true,
      });
    }

    append({ type: "task.status_changed", status: "running" });

    const prior = config.chatMessages ?? [];
    const messages: UIMessage[] = config.isRetry
      ? [...prior]
      : [
          ...prior,
          {
            id: `user-${taskId}`,
            role: "user",
            parts: [{ type: "text", text: config.prompt }],
          },
        ];

    const result = await runAgentLoop({
      taskId,
      messages,
      modelId: config.modelId,
      settings: config.settings,
      secrets: config.secrets,
      signal,
      append,
      workspaceRoot,
      escalationPort,
      entitlements,
      osLease,
      standingPolicy: standingPolicy ?? config.standingPolicy,
    });

    if (result.finishReason === "error") {
      return;
    }

    if (result.finishReason === "budget") {
      append({ type: "task.completed", finishReason: "budget" });
      return;
    }

    if (result.finishReason === "cancelled") {
      return;
    }

    append({ type: "task.completed", finishReason: "stop" });
  };
}
