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
import type { CapabilityDefinition, CapabilityRisk } from "./types";
import { windowFocusCapability } from "./window/focus";
import { getActiveWindowCapability } from "./window/get-active";
import { windowListCapability } from "./window/list";
import { windowMoveCapability } from "./window/move";
import { windowResizeCapability } from "./window/resize";
import { windowStateCapability } from "./window/state";

/** Single source of registered capabilities. Add new tools here + Rust command. */
export const CAPABILITIES = [
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
] as const satisfies readonly CapabilityDefinition[];

export type CapabilityName = (typeof CAPABILITIES)[number]["name"];

const capabilityByName = new Map<string, CapabilityDefinition>(
  CAPABILITIES.map((capability) => [capability.name, capability]),
);

export function getCapabilities(): readonly CapabilityDefinition[] {
  return CAPABILITIES;
}

export function getCapabilityDefinition(name: string): CapabilityDefinition {
  const capability = capabilityByName.get(name);
  if (!capability) {
    throw new Error(`Unknown capability: ${name}`);
  }
  return capability;
}

export function isCapabilityName(name: string): name is CapabilityName {
  return capabilityByName.has(name);
}

/** Capability names grouped by risk for system-prompt generation. */
export function getCapabilityNamesByRisk(): Record<CapabilityRisk, string[]> {
  const groups: Record<CapabilityRisk, string[]> = { low: [], medium: [], high: [] };
  for (const capability of CAPABILITIES) {
    groups[capability.risk].push(capability.name);
  }
  return groups;
}
