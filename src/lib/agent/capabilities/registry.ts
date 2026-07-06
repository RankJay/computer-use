import { tool, zodSchema } from "ai";

import { formatCapabilityError } from "@/lib/agent/tool-errors";

import { getV1Capabilities } from "./catalog";
import type { V1CapabilityName } from "./catalog";
import { invokeCapability } from "./invoke";
import type { CapabilityDefinition, CapabilityError, InvokeCapabilityDeps } from "./types";

export { getCapabilityDefinition, getV1Capabilities, isV1CapabilityName } from "./catalog";
export type { V1CapabilityName } from "./catalog";

function capabilityExecutionError(error: CapabilityError): Error {
  const formatted = formatCapabilityError(error);
  const executionError = new Error(formatted);
  executionError.name = error.code;
  return executionError;
}

async function executeViaInvoke(
  name: string,
  input: unknown,
  deps: InvokeCapabilityDeps,
  toolCallId: string,
): Promise<unknown> {
  const result = await invokeCapability(name, input, deps, toolCallId);

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

function makeAgentTool(capability: CapabilityDefinition, deps: InvokeCapabilityDeps) {
  return tool({
    description: capability.description,
    inputSchema: zodSchema(capability.inputSchema),
    execute: async (input, { toolCallId }) =>
      executeViaInvoke(capability.name, input, deps, toolCallId),
  });
}

export function buildAgentTools(deps: InvokeCapabilityDeps) {
  const enabledCapabilities = getV1Capabilities().filter(
    (capability) => capability.enabledWhen?.(deps.settings) ?? true,
  );

  const entries = enabledCapabilities.map(
    (capability) => [capability.name, makeAgentTool(capability, deps)] as const,
  );

  return Object.fromEntries(entries) as Partial<{
    [K in V1CapabilityName]: ReturnType<typeof makeAgentTool>;
  }>;
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
