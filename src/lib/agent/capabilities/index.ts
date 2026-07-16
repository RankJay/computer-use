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

export { needsPermission, permissionRiskForCapability } from "./permission";
export {
  createDefaultNativeInvoker,
  createMockCapabilityInvoker,
  invokeCapabilityCommand,
  mapInvokeError,
} from "./native-invoke";
export { runCapability } from "./runner";
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
