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
export { readDirectoryCapability } from "./file-system/read-directory";
export { searchFilesCapability } from "./file-system/search-files";
export { writeFileCapability } from "./file-system/write-file";
export { createDirectoryCapability } from "./file-system/create-directory";
export { patchFileCapability } from "./file-system/patch-file";
export { deletePathCapability } from "./file-system/delete-path";
export { movePathCapability } from "./file-system/move-path";
export { duplicatePathCapability } from "./file-system/duplicate-path";
export { statPathCapability } from "./file-system/stat-path";
export { getSystemInfoCapability } from "./shell/get-system-info";
export { readClipboardCapability } from "./clipboard/read-clipboard";
export { runShellCapability } from "./shell/run-shell";
export { writeClipboardCapability } from "./clipboard/write-clipboard";
export { waitCapability } from "./shared/wait";
