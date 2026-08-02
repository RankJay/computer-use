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
    model = deps.modelOverride ?? resolveLanguageModel(deps.config.modelId, deps.config.secrets);
  } catch (error) {
    const mapped = mapAgentError(error);
    deps.append({
      type: "attempt.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }

  const system = buildSystemPrompt(deps.config.settings);

  try {
    return await runStreamCoordinator({
      ...deps,
      model,
      system,
    });
  } catch (error) {
    if (deps.signal.aborted) {
      return { finishReason: "cancelled" };
    }

    const mapped = mapAgentError(error);
    deps.append({
      type: "attempt.failed",
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
    });
    return { finishReason: "error" };
  }
}
