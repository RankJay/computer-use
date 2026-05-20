import { hostRuntime, type HostRuntime } from "@/agent/host/hostRuntime";
import type { AgentEvent } from "@/agent/types";

export function eventForDiskLog(event: AgentEvent): Record<string, unknown> {
  const base: Record<string, unknown> = { ...event };
  if (event.type === "screenshot.keyframe" && "imageBase64" in base) {
    base.imageBase64Redacted = true;
    delete base.imageBase64;
  }
  return base;
}

export async function appendSessionLogLine(
  sessionId: string,
  event: AgentEvent,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  if (!runtime.canPersistSessionLogs) return;
  const line = JSON.stringify(eventForDiskLog(event));
  await runtime.appendSessionLogLine(sessionId, line);
}

export async function persistKeyframePng(
  sessionId: string,
  filename: string,
  pngBase64: string,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  if (!runtime.canPersistSessionLogs) return;
  await runtime.writeSessionKeyframe(sessionId, filename, pngBase64);
}

export async function clearAllLogs(runtime: HostRuntime = hostRuntime): Promise<void> {
  await runtime.clearAllLogs();
}

export async function openLogsFolder(runtime: HostRuntime = hostRuntime): Promise<void> {
  await runtime.openLogsFolder();
}
