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
} from "@/agent/native/tauriIpc";

export type RunCommandResult = RunCommandResponse;
export type DisplayCaptureResult = DisplayCaptureResponse;
export type PointerMoveResult = PointerMoveResponse;

export type AgentNativeBridge = {
  capturePrimaryDisplayPngBase64: () => Promise<DisplayCaptureResult>;
  runCommand: (input: RunCommandRequest) => Promise<RunCommandResult>;
  cancelRunCommand: (cancelToken: number) => Promise<void>;
  pointerMoveTo: (x: number, y: number) => Promise<PointerMoveResult>;
  pointerClick: (button: PointerButton) => Promise<void>;
  typeText: (text: string) => Promise<void>;
  keyTap: (key: KeyTapLogicalKey) => Promise<void>;
  resetPointerAutomationCancel: () => Promise<void>;
  cancelPointerAutomation: () => Promise<void>;
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
    pointerMoveTo: (x, y) => invoke<PointerMoveResult>(TAURI_COMMAND.pointerMoveTo, { x, y }),
    pointerClick: (button) => invoke<void>(TAURI_COMMAND.pointerClick, { button }),
    typeText: (text) => invoke<void>(TAURI_COMMAND.typeText, { text }),
    keyTap: (key) => invoke<void>(TAURI_COMMAND.keyTap, { key }),
    resetPointerAutomationCancel: () => invoke<void>(TAURI_COMMAND.resetPointerAutomationCancel),
    cancelPointerAutomation: () => invoke<void>(TAURI_COMMAND.cancelPointerAutomation),
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
