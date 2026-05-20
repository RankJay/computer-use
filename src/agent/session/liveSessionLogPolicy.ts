import type { HostRuntime } from "@/agent/host/hostRuntime";
import { hostRuntime } from "@/agent/host/hostRuntime";
import { appendSessionLogLine, persistKeyframePng } from "@/agent/persistence/sessionLogs";
import type { AgentEvent, EmitFn } from "@/agent/types";
import { createEventId } from "@/agent/types";

export async function persistLiveSessionEvent(
  taskId: string,
  event: AgentEvent,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  await appendSessionLogLine(taskId, event, runtime);
  if (event.type === "screenshot.keyframe" && event.imageBase64) {
    const filename = `${createEventId()}.png`;
    await persistKeyframePng(taskId, filename, event.imageBase64, runtime);
  }
}

export async function emitAndPersistLiveSessionEvent(
  emit: EmitFn,
  taskId: string,
  event: AgentEvent,
  runtime: HostRuntime = hostRuntime,
): Promise<void> {
  emit(event);
  await persistLiveSessionEvent(taskId, event, runtime);
}
