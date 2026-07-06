export type {
  CapabilityContext,
  CapabilityDefinition,
  CapabilityError,
  CapabilityRisk,
  InvokeCapabilityDeps,
  InvokeCapabilityResult,
  PermissionWaiter,
} from "./types";

export { defineCapability } from "./types";

export { needsPermission } from "./permission";
export {
  createMockCapabilityInvoker,
  createTauriCapabilityInvoker,
  invokeCapabilityCommand,
  isTauriRuntime,
  mapInvokeError,
} from "./tauri-invoke";
export {
  getCapabilityDefinition,
  getV1Capabilities,
  isV1CapabilityName,
  buildAgentTools,
} from "./registry";
export type { V1CapabilityName, AgentTools } from "./registry";
export { invokeCapability } from "./invoke";
export { readFileCapability } from "./read-file";
export { searchFilesCapability } from "./search-files";
export { writeFileCapability } from "./write-file";
export { deleteFileCapability } from "./delete-file";
export { getSystemInfoCapability } from "./get-system-info";
export { readClipboardCapability } from "./read-clipboard";
export { runShellCapability } from "./run-shell";
export { writeClipboardCapability } from "./write-clipboard";
