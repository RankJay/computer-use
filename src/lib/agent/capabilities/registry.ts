import { tool, zodSchema } from "ai";

import { getV1Capabilities } from "./catalog";
import { invokeCapability } from "./invoke";
import type { CapabilityDefinition, InvokeCapabilityDeps } from "./types";
import type { V1CapabilityName } from "./catalog";

export {
  getCapabilityDefinition,
  getV1Capabilities,
  isV1CapabilityName,
} from "./catalog";
export type { V1CapabilityName } from "./catalog";

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
    throw new Error(result.error.message);
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
  const entries = getV1Capabilities().map(
    (capability) => [capability.name, makeAgentTool(capability, deps)] as const,
  );

  return Object.fromEntries(entries) as {
    [K in V1CapabilityName]: ReturnType<typeof makeAgentTool>;
  };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
