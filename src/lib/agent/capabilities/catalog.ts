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
];

export type V1CapabilityName =
  | "read_file"
  | "search_files"
  | "write_file"
  | "delete_file"
  | "run_shell"
  | "read_clipboard"
  | "write_clipboard"
  | "get_system_info";

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
