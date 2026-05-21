import type {
  AssistantTextDoneEvent,
  TaskCancelledEvent,
  TaskCompletedEvent,
  TaskCreatedEvent,
  TaskFailedEvent,
} from "@/agent/types";

export type LiveTaskEventMeta = {
  readonly id: string;
  readonly at: number;
};

export function buildTaskCreatedEvent(
  taskId: string,
  prompt: string,
  meta: LiveTaskEventMeta,
): TaskCreatedEvent {
  return {
    ...meta,
    taskId,
    type: "task.created",
    prompt,
  };
}

export function buildAssistantTextDoneEvent(
  taskId: string,
  meta: LiveTaskEventMeta,
): AssistantTextDoneEvent {
  return {
    ...meta,
    taskId,
    type: "assistant.text.done",
  };
}

export function buildTaskCompletedEvent(
  taskId: string,
  text: string,
  meta: LiveTaskEventMeta,
): TaskCompletedEvent {
  const summary =
    text.length > 0
      ? text.slice(0, 8000)
      : "Model run finished with no textual summary (tools may have executed).";
  return {
    ...meta,
    taskId,
    type: "task.completed",
    summary,
  };
}

export function buildTaskFailedEvent(
  taskId: string,
  err: unknown,
  meta: LiveTaskEventMeta,
): TaskFailedEvent {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ...meta,
    taskId,
    type: "task.failed",
    message,
  };
}

export function buildTaskCancelledEvent(
  taskId: string,
  reason: string,
  meta: LiveTaskEventMeta,
): TaskCancelledEvent {
  return {
    ...meta,
    taskId,
    type: "task.cancelled",
    reason,
  };
}

export function buildLiveCompletionEvents(
  taskId: string,
  text: string,
  createMeta: () => LiveTaskEventMeta,
): {
  readonly done: AssistantTextDoneEvent;
  readonly completed: TaskCompletedEvent;
} {
  const doneMeta = createMeta();
  const completeMeta = createMeta();
  return {
    done: buildAssistantTextDoneEvent(taskId, doneMeta),
    completed: buildTaskCompletedEvent(taskId, text, completeMeta),
  };
}
