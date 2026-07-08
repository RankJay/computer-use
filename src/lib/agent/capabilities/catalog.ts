import { accessibilityClickCapability } from "./accessibility/click";
import { accessibilityExpandNodeCapability } from "./accessibility/expand-node";
import { accessibilityFindElementCapability } from "./accessibility/find-element";
import { accessibilityFocusCapability } from "./accessibility/focus";
import { accessibilitySendKeysCapability } from "./accessibility/send-keys";
import { accessibilitySetValueCapability } from "./accessibility/set-value";
import { accessibilitySnapshotCapability } from "./accessibility/snapshot";
import { readClipboardCapability } from "./clipboard/read-clipboard";
import { writeClipboardCapability } from "./clipboard/write-clipboard";
import { deleteFileCapability } from "./file-system/delete-file";
import { readFileCapability } from "./file-system/read-file";
import { searchFilesCapability } from "./file-system/search-files";
import { writeFileCapability } from "./file-system/write-file";
import { getSystemInfoCapability } from "./shell/get-system-info";
import { runShellCapability } from "./shell/run-shell";
import type { CapabilityDefinition } from "./types";
import { accessibilityListWindowsCapability } from "./window/list-windows";

const V1_CAPABILITIES: CapabilityDefinition[] = [
  readFileCapability,
  searchFilesCapability,
  writeFileCapability,
  deleteFileCapability,
  runShellCapability,
  readClipboardCapability,
  writeClipboardCapability,
  getSystemInfoCapability,
  accessibilityListWindowsCapability,
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
  | "search_files"
  | "write_file"
  | "delete_file"
  | "run_shell"
  | "read_clipboard"
  | "write_clipboard"
  | "get_system_info"
  | "accessibility_list_windows"
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
