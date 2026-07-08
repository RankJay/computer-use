import { accessibilityClickCapability } from "./accessibility/click";
import { accessibilityExpandNodeCapability } from "./accessibility/expand-node";
import { accessibilityFindElementCapability } from "./accessibility/find-element";
import { accessibilityFocusCapability } from "./accessibility/focus";
import { accessibilitySendKeysCapability } from "./accessibility/send-keys";
import { accessibilitySetValueCapability } from "./accessibility/set-value";
import { accessibilitySnapshotCapability } from "./accessibility/snapshot";
import { readClipboardCapability } from "./clipboard/read-clipboard";
import { writeClipboardCapability } from "./clipboard/write-clipboard";
import { createDirectoryCapability } from "./file-system/create-directory";
import { deletePathCapability } from "./file-system/delete-path";
import { duplicatePathCapability } from "./file-system/duplicate-path";
import { movePathCapability } from "./file-system/move-path";
import { patchFileCapability } from "./file-system/patch-file";
import { readDirectoryCapability } from "./file-system/read-directory";
import { readFileCapability } from "./file-system/read-file";
import { searchFilesCapability } from "./file-system/search-files";
import { statPathCapability } from "./file-system/stat-path";
import { writeFileCapability } from "./file-system/write-file";
import { waitCapability } from "./shared/wait";
import { getEnvCapability } from "./shell/get-env";
import { getSystemInfoCapability } from "./shell/get-system-info";
import { launchCapability } from "./shell/launch";
import { processInfoCapability } from "./shell/process-info";
import { processKillCapability } from "./shell/process-kill";
import { processListCapability } from "./shell/process-list";
import { runShellCapability } from "./shell/run-shell";
import { setEnvCapability } from "./shell/set-env";
import type { CapabilityDefinition } from "./types";
import { windowFocusCapability } from "./window/focus";
import { getActiveWindowCapability } from "./window/get-active";
import { windowListCapability } from "./window/list";
import { windowMoveCapability } from "./window/move";
import { windowResizeCapability } from "./window/resize";
import { windowStateCapability } from "./window/state";

const V1_CAPABILITIES: CapabilityDefinition[] = [
  readFileCapability,
  readDirectoryCapability,
  searchFilesCapability,
  writeFileCapability,
  createDirectoryCapability,
  patchFileCapability,
  deletePathCapability,
  movePathCapability,
  duplicatePathCapability,
  statPathCapability,
  runShellCapability,
  processListCapability,
  processInfoCapability,
  processKillCapability,
  launchCapability,
  getEnvCapability,
  setEnvCapability,
  readClipboardCapability,
  writeClipboardCapability,
  getSystemInfoCapability,
  waitCapability,
  windowListCapability,
  windowFocusCapability,
  windowStateCapability,
  windowMoveCapability,
  windowResizeCapability,
  getActiveWindowCapability,
  accessibilitySnapshotCapability,
  accessibilityFindElementCapability,
  accessibilityExpandNodeCapability,
  accessibilityClickCapability,
  accessibilitySetValueCapability,
  accessibilitySendKeysCapability,
  accessibilityFocusCapability,
];

export type V1CapabilityName =
  | "read_file"
  | "read_directory"
  | "search_files"
  | "write_file"
  | "create_directory"
  | "patch_file"
  | "delete_path"
  | "move_path"
  | "duplicate_path"
  | "stat_path"
  | "run_shell"
  | "process_list"
  | "process_info"
  | "process_kill"
  | "launch"
  | "get_env"
  | "set_env"
  | "read_clipboard"
  | "write_clipboard"
  | "get_system_info"
  | "wait"
  | "window_list"
  | "window_focus"
  | "window_state"
  | "window_move"
  | "window_resize"
  | "get_active_window"
  | "accessibility_snapshot"
  | "accessibility_find_element"
  | "accessibility_expand_node"
  | "accessibility_click"
  | "accessibility_set_value"
  | "accessibility_send_keys"
  | "accessibility_focus";

const capabilityByName = new Map<string, CapabilityDefinition>(
  V1_CAPABILITIES.map((capability) => [capability.name, capability]),
);

export function getV1Capabilities(): readonly CapabilityDefinition[] {
  return V1_CAPABILITIES;
}

export function getCapabilityDefinition(name: string): CapabilityDefinition {
  const capability = capabilityByName.get(name);
  if (!capability) {
    throw new Error(`Unknown capability: ${name}`);
  }
  return capability;
}

export function isV1CapabilityName(name: string): name is V1CapabilityName {
  return capabilityByName.has(name);
}
