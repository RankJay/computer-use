import { mapAgentError, resolveLanguageModel } from "@/lib/agent/model-provider";
import { buildSystemPrompt } from "@/lib/agent/prompts/system";
import { runStreamCoordinator } from "@/lib/agent/run-stream-coordinator";
import type { RunAgentDeps, RunAgentResult } from "@/lib/agent/types";

export async function runAgentLoop(deps: RunAgentDeps): Promise<RunAgentResult> {
  if (deps.signal.aborted) {
    return { finishReason: "cancelled" };
  }

  let model;
  try {
    model = deps.modelOverride ?? resolveLanguageModel(deps.modelId, deps.secrets);
  } catch (error) {
    const mapped = mapAgentError(error);
    deps.append({
      type: "task.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }

  const system = buildSystemPrompt(deps.settings);

  try {
    return await runStreamCoordinator({
      taskId: deps.taskId,
      model,
      modelId: deps.modelId,
      system,
      messages: deps.messages,
      settings: deps.settings,
      signal: deps.signal,
      append: deps.append,
      workspaceRoot: deps.workspaceRoot,
      createPermissionWaiter: deps.createPermissionWaiter,
      entitlements: deps.entitlements,
      budgetStartedAt: deps.budgetStartedAt,
    });
  } catch (error) {
    if (deps.signal.aborted) {
      return { finishReason: "cancelled" };
    }

    const mapped = mapAgentError(error);
    deps.append({
      type: "task.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }
}
