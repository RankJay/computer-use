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
export { readFileCapability } from "./file-system/read-file";
export { searchFilesCapability } from "./file-system/search-files";
export { writeFileCapability } from "./file-system/write-file";
export { deleteFileCapability } from "./file-system/delete-file";
export { getSystemInfoCapability } from "./shell/get-system-info";
export { readClipboardCapability } from "./clipboard/read-clipboard";
export { runShellCapability } from "./shell/run-shell";
export { writeClipboardCapability } from "./clipboard/write-clipboard";
