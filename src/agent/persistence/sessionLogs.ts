import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/agent/native/nativeBridge";
import { TAURI_COMMAND } from "@/agent/native/tauriIpc";
import type { AgentEvent } from "@/agent/types";

export function eventForDiskLog(event: AgentEvent): Record<string, unknown> {
  const base: Record<string, unknown> = { ...event };
  if (event.type === "screenshot.keyframe" && "imageBase64" in base) {
    base.imageBase64Redacted = true;
    delete base.imageBase64;
  }
  return base;
}

export async function appendSessionLogLine(sessionId: string, event: AgentEvent): Promise<void> {
  if (!isTauriRuntime()) return;
  const line = JSON.stringify(eventForDiskLog(event));
  await invoke(TAURI_COMMAND.appendSessionLog, { sessionId, line });
}

export async function persistKeyframePng(
  sessionId: string,
  filename: string,
  pngBase64: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.writeSessionKeyframe, {
    sessionId,
    filename,
    pngBase64,
  });
}

export async function clearAllLogs(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.clearAllLogs);
}

export async function openLogsFolder(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke(TAURI_COMMAND.openLogsFolder);
}
