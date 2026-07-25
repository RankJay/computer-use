import { tool, zodSchema } from "ai";

import { formatCapabilityError } from "@/lib/agent/tool-errors";

import { getCapabilities, type CapabilityName } from "./catalog";
import { runCapability } from "./runner";
import {
  capabilityUsesImageModelOutput,
  imageToolToModelOutput,
} from "./shared/image-model-output";
import type { CapabilityDefinition, CapabilityError, CapabilityRunnerDeps } from "./types";

export {
  getCapabilityDefinition,
  getCapabilityNamesByRisk,
  getCapabilities,
  isCapabilityName,
} from "./catalog";
export type { CapabilityName } from "./catalog";

function capabilityExecutionError(error: CapabilityError): Error {
  const formatted = formatCapabilityError(error);
  const executionError = new Error(formatted);
  executionError.name = error.code;
  return executionError;
}

async function executeViaRunner(
  name: string,
  input: unknown,
  deps: CapabilityRunnerDeps,
  toolCallId: string,
): Promise<unknown> {
  const result = await runCapability(name, input, deps, toolCallId);

  if (result.ok) {
    return result.output;
  }

  if ("denied" in result && result.denied) {
    throw new Error("User denied permission for this tool call.");
  }

  if ("error" in result) {
    throw capabilityExecutionError(result.error);
  }

  throw new Error("Capability invocation failed.");
}

function makeAgentTool(capability: CapabilityDefinition, deps: CapabilityRunnerDeps) {
  if (capabilityUsesImageModelOutput(capability.name)) {
    return tool({
      description: capability.description,
      inputSchema: zodSchema(capability.inputSchema),
      execute: async (input, { toolCallId }) =>
        executeViaRunner(capability.name, input, deps, toolCallId),
      toModelOutput: imageToolToModelOutput,
    });
  }

  return tool({
    description: capability.description,
    inputSchema: zodSchema(capability.inputSchema),
    execute: async (input, { toolCallId }) =>
      executeViaRunner(capability.name, input, deps, toolCallId),
  });
}

export function buildAgentTools(deps: CapabilityRunnerDeps) {
  const enabledCapabilities = getCapabilities().filter(
    (capability) => capability.enabledWhen?.(deps.settings) ?? true,
  );

  const entries = enabledCapabilities.map(
    (capability) => [capability.name, makeAgentTool(capability, deps)] as const,
  );

  return Object.fromEntries(entries) as Partial<{
    [K in CapabilityName]: ReturnType<typeof makeAgentTool>;
  }>;
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
