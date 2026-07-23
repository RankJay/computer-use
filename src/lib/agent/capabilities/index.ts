/**
 * Public capability surface for UI labels + agent tool wiring.
 * Permission policy, runner, native-invoke, risk: import from subpaths.
 */

export type {
  CapabilityDefinition,
  CapabilityError,
  CapabilityNativeInvoker,
  CapabilityRisk,
  CapabilityRunnerDeps,
  InvokeCapabilityResult,
  ToolPartLocation,
} from "./types";
export { defineCapability } from "./types";

export {
  buildAgentTools,
  getCapabilityDefinition,
  getCapabilityNamesByRisk,
  getCapabilities,
  isCapabilityName,
} from "./registry";
export type { AgentTools, CapabilityName } from "./registry";

export { toolActivityDetail } from "./ui-activity-detail";
export { uiToolLabel } from "./ui-labels";
