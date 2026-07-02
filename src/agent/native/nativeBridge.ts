import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { detectDesktopHost } from "@/agent/host/detectDesktopHost";
import {
  TAURI_COMMAND,
  type DisplayCaptureResponse,
  type KeyTapLogicalKey,
  type PointerButton,
  type PointerMoveResponse,
  type RunCommandRequest,
  type RunCommandResponse,
  type ClipboardReadResponse,
  type DisplayInfoResponse,
  type UiA11yInteractRequest,
  type UiA11yInteractResponse,
  type UiA11ySnapshotRequest,
  type UiA11ySnapshotResponse,
} from "@/agent/native/tauriIpc";

export type RunCommandResult = RunCommandResponse;
export type DisplayCaptureResult = DisplayCaptureResponse;
export type PointerMoveResult = PointerMoveResponse;
export type UiA11ySnapshotResult = UiA11ySnapshotResponse;
export type UiA11yInteractResult = UiA11yInteractResponse;
export type DisplayInfoResult = DisplayInfoResponse;
export type ClipboardReadResult = ClipboardReadResponse;

export type AgentNativeBridge = {
  capturePrimaryDisplayPngBase64: () => Promise<DisplayCaptureResult>;
  runCommand: (input: RunCommandRequest) => Promise<RunCommandResult>;
  cancelRunCommand: (cancelToken: number) => Promise<void>;
  pointerMoveTo: (blockX: number, blockY: number) => Promise<PointerMoveResult>;
  pointerClick: (button: PointerButton, clickCount?: number) => Promise<void>;
  typeText: (text: string) => Promise<void>;
  keyTap: (key: KeyTapLogicalKey) => Promise<void>;
  resetPointerAutomationCancel: () => Promise<void>;
  cancelPointerAutomation: () => Promise<void>;
  uiA11ySnapshot: (input: UiA11ySnapshotRequest) => Promise<UiA11ySnapshotResult>;
  uiA11yInteract: (input: UiA11yInteractRequest) => Promise<UiA11yInteractResult>;
  getDisplayInfo: () => Promise<DisplayInfoResult>;
  clipboardReadText: () => Promise<ClipboardReadResult>;
  clipboardWriteText: (text: string) => Promise<void>;
  clipboardPaste: () => Promise<void>;
};

export function isTauriRuntime(): boolean {
  return detectDesktopHost();
}

export function createNativeBridge(): AgentNativeBridge | null {
  if (!detectDesktopHost()) return null;
  return {
    capturePrimaryDisplayPngBase64: () =>
      invoke<DisplayCaptureResult>(TAURI_COMMAND.capturePrimaryDisplayPngBase64),
    runCommand: (input) =>
      invoke<RunCommandResult>(TAURI_COMMAND.runCommand, {
        request: {
          program: input.program,
          args: input.args,
          cwd: input.cwd,
          timeoutMs: input.timeoutMs ?? null,
          maxOutputBytes: input.maxOutputBytes ?? null,
          cancelToken: input.cancelToken ?? null,
        },
      }),
    cancelRunCommand: (cancelToken) =>
      invoke<void>(TAURI_COMMAND.cancelRunCommand, { cancelToken }),
    pointerMoveTo: (blockX, blockY) =>
      invoke<PointerMoveResult>(TAURI_COMMAND.pointerMoveTo, { blockX, blockY }),
    pointerClick: (button, clickCount) =>
      invoke<void>(TAURI_COMMAND.pointerClick, { button, clickCount: clickCount ?? 1 }),
    typeText: (text) => invoke<void>(TAURI_COMMAND.typeText, { text }),
    keyTap: (key) => invoke<void>(TAURI_COMMAND.keyTap, { key }),
    resetPointerAutomationCancel: () => invoke<void>(TAURI_COMMAND.resetPointerAutomationCancel),
    cancelPointerAutomation: () => invoke<void>(TAURI_COMMAND.cancelPointerAutomation),
    uiA11ySnapshot: (input) =>
      invoke<UiA11ySnapshotResult>(TAURI_COMMAND.uiA11ySnapshot, {
        request: {
          appName: input.appName ?? null,
          foregroundOnly: input.foregroundOnly ?? null,
          maxDepth: input.maxDepth ?? null,
          interactiveOnly: input.interactiveOnly ?? null,
        },
      }),
    uiA11yInteract: (input) =>
      invoke<UiA11yInteractResult>(TAURI_COMMAND.uiA11yInteract, {
        request: {
          elementId: input.elementId,
          action: input.action,
          text: input.text ?? null,
          clickCount: input.clickCount ?? null,
        },
      }),
    getDisplayInfo: () => invoke<DisplayInfoResult>(TAURI_COMMAND.getDisplayInfo),
    clipboardReadText: () => invoke<ClipboardReadResult>(TAURI_COMMAND.clipboardReadText),
    clipboardWriteText: (text) => invoke<void>(TAURI_COMMAND.clipboardWriteText, { text }),
    clipboardPaste: () => invoke<void>(TAURI_COMMAND.clipboardPaste),
  };
}

export async function cancelPointerAutomation(): Promise<void> {
  if (!detectDesktopHost()) return;
  await invoke<void>(TAURI_COMMAND.cancelPointerAutomation);
}

export async function minimizeActuateWindow(): Promise<void> {
  if (!detectDesktopHost()) return;
  await getCurrentWindow().minimize();
}

export function startActuateWindowDrag(): void {
  if (!detectDesktopHost()) return;
  void getCurrentWindow().startDragging();
}
