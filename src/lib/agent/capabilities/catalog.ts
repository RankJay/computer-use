import { accessibilityClickCapability } from "./accessibility-click";
import { accessibilityExpandNodeCapability } from "./accessibility-expand-node";
import { accessibilityFindElementCapability } from "./accessibility-find-element";
import { accessibilityFocusCapability } from "./accessibility-focus";
import { accessibilityListWindowsCapability } from "./accessibility-list-windows";
import { accessibilitySendKeysCapability } from "./accessibility-send-keys";
import { accessibilitySetValueCapability } from "./accessibility-set-value";
import { accessibilitySnapshotCapability } from "./accessibility-snapshot";
import { deleteFileCapability } from "./delete-file";
import { getSystemInfoCapability } from "./get-system-info";
import { readClipboardCapability } from "./read-clipboard";
import { readFileCapability } from "./read-file";
import { runShellCapability } from "./run-shell";
import { searchFilesCapability } from "./search-files";
import type { CapabilityDefinition } from "./types";
import { writeClipboardCapability } from "./write-clipboard";
import { writeFileCapability } from "./write-file";

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
