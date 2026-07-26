import type { AppSettings } from "@/lib/settings/types";

import { accessibilityClickCapability } from "./accessibility/click";
import { accessibilityElementAtPointCapability } from "./accessibility/element-at-point";
import { accessibilityFindElementCapability } from "./accessibility/find-element";
import { accessibilityFocusCapability } from "./accessibility/focus";
import { accessibilityGetFocusedCapability } from "./accessibility/get-focused";
import { accessibilityGetSelectionCapability } from "./accessibility/get-selection";
import { accessibilityGetTextCapability } from "./accessibility/get-text";
import { accessibilityGetValueCapability } from "./accessibility/get-value";
import { accessibilityInspectCapability } from "./accessibility/inspect";
import { accessibilityInvokeActionCapability } from "./accessibility/invoke-action";
import { accessibilityQueryCapability } from "./accessibility/query";
import { accessibilityRightClickCapability } from "./accessibility/right-click";
import { accessibilityScrollElementCapability } from "./accessibility/scroll-element";
import { accessibilitySendKeysCapability } from "./accessibility/send-keys";
import { accessibilitySetValueCapability } from "./accessibility/set-value";
import { accessibilitySnapshotCapability } from "./accessibility/snapshot";
import { accessibilityWaitCapability } from "./accessibility/wait";
import { readClipboardCapability } from "./clipboard/read-clipboard";
import { readClipboardHtmlCapability } from "./clipboard/read-clipboard-html";
import { readClipboardImageCapability } from "./clipboard/read-clipboard-image";
import { writeClipboardCapability } from "./clipboard/write-clipboard";
import { writeClipboardHtmlCapability } from "./clipboard/write-clipboard-html";
import { writeClipboardImageCapability } from "./clipboard/write-clipboard-image";
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
import { hotkeyCapability } from "./keyboard/hotkey";
import { keyDownCapability } from "./keyboard/key-down";
import { keyPressCapability } from "./keyboard/key-press";
import { keyUpCapability } from "./keyboard/key-up";
import { mouseClickCapability } from "./mouse/click";
import { mouseClickImageCapability } from "./mouse/click-image";
import { mouseDownCapability } from "./mouse/down";
import { mouseDragCapability } from "./mouse/drag";
import { mouseHoverCapability } from "./mouse/hover";
import { mouseMoveCapability } from "./mouse/move";
import { mouseScrollCapability } from "./mouse/scroll";
import { mouseUpCapability } from "./mouse/up";
import { screenshotCapability } from "./screenshot/screenshot";
import { screenshotRegionCapability } from "./screenshot/screenshot-region";
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
  readClipboardHtmlCapability,
  writeClipboardHtmlCapability,
  readClipboardImageCapability,
  writeClipboardImageCapability,
  getSystemInfoCapability,
  waitCapability,
  windowListCapability,
  windowFocusCapability,
  windowStateCapability,
  windowMoveCapability,
  windowResizeCapability,
  getActiveWindowCapability,
  screenshotCapability,
  screenshotRegionCapability,
  accessibilitySnapshotCapability,
  accessibilityQueryCapability,
  accessibilityFindElementCapability,
  accessibilityWaitCapability,
  accessibilityGetTextCapability,
  accessibilityGetFocusedCapability,
  accessibilityElementAtPointCapability,
  accessibilityInspectCapability,
  accessibilityGetSelectionCapability,
  accessibilityClickCapability,
  accessibilitySetValueCapability,
  accessibilityGetValueCapability,
  accessibilityScrollElementCapability,
  accessibilityRightClickCapability,
  accessibilityInvokeActionCapability,
  accessibilitySendKeysCapability,
  accessibilityFocusCapability,
  mouseMoveCapability,
  mouseClickCapability,
  mouseClickImageCapability,
  mouseScrollCapability,
  mouseDragCapability,
  mouseHoverCapability,
  mouseDownCapability,
  mouseUpCapability,
  hotkeyCapability,
  keyDownCapability,
  keyUpCapability,
  keyPressCapability,
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

/**
 * Capability names grouped by risk.
 * When settings are provided, skips tools whose `enabledWhen` predicate fails
 * (same filter as `buildAgentTools`).
 */
export function getCapabilityNamesByRisk(settings?: AppSettings): Record<CapabilityRisk, string[]> {
  const groups: Record<CapabilityRisk, string[]> = { low: [], medium: [], high: [] };
  for (const capability of CAPABILITIES) {
    if (settings && capability.enabledWhen?.(settings) === false) continue;
    groups[capability.risk].push(capability.name);
  }
  return groups;
}
