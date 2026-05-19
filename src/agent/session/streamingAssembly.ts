import type {
  AgentTimelineItem,
  AssistantTextDeltaEvent,
  AssistantTextDoneEvent,
} from "@/agent/types";

export type AssistantStreamEvent = AssistantTextDeltaEvent | AssistantTextDoneEvent;

export function applyAssistantStreamEvent(
  timeline: readonly AgentTimelineItem[],
  event: AssistantStreamEvent,
): readonly AgentTimelineItem[] {
  switch (event.type) {
    case "assistant.text.delta": {
      const last = timeline[timeline.length - 1];
      if (last?.kind === "assistant" && last.status === "streaming") {
        return [
          ...timeline.slice(0, -1),
          { ...last, text: last.text + event.text },
        ];
      }

      return [
        ...timeline,
        {
          id: event.id,
          at: event.at,
          kind: "assistant",
          text: event.text,
          status: "streaming",
        },
      ];
    }
    case "assistant.text.done": {
      const last = timeline[timeline.length - 1];
      if (last?.kind !== "assistant" || last.status !== "streaming") {
        return timeline;
      }

      const text = last.text.trim();
      if (text.length === 0) {
        return timeline.slice(0, -1);
      }

      return [
        ...timeline.slice(0, -1),
        { ...last, id: event.id, text, status: "complete" },
      ];
    }
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

/** Finalizes in-progress assistant text before tool/plan activity. */
export function finalizeStreamingAssistant(
  timeline: readonly AgentTimelineItem[],
): readonly AgentTimelineItem[] {
  const last = timeline[timeline.length - 1];
  if (last?.kind !== "assistant" || last.status !== "streaming") {
    return timeline;
  }

  const text = last.text.trim();
  if (text.length === 0) {
    return timeline.slice(0, -1);
  }

  return [...timeline.slice(0, -1), { ...last, text, status: "complete" }];
}

export function trimLastAssistantMessage(
  timeline: readonly AgentTimelineItem[],
): readonly AgentTimelineItem[] {
  const next = [...timeline];

  while (next.length > 0) {
    const last = next[next.length - 1];
    if (last?.kind !== "assistant" && last?.kind !== "activity") break;
    next.pop();
  }

  return next;
}
