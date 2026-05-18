import type {
  AgentTimelineItem,
  AssistantTextDeltaEvent,
  AssistantTextDoneEvent,
} from "@/agent/types";

export type AssistantStreamAssembly = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly assistantStream: string;
};

export type AssistantStreamEvent = AssistantTextDeltaEvent | AssistantTextDoneEvent;

export function applyAssistantStreamEvent(
  state: AssistantStreamAssembly,
  event: AssistantStreamEvent,
): AssistantStreamAssembly {
  switch (event.type) {
    case "assistant.text.delta":
      return {
        ...state,
        assistantStream: state.assistantStream + event.text,
      };
    case "assistant.text.done": {
      const text = state.assistantStream.trim();
      return {
        ...state,
        assistantStream: "",
        timeline:
          text.length === 0
            ? state.timeline
            : [...state.timeline, { id: event.id, at: event.at, kind: "assistant", text }],
      };
    }
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

export function trimLastAssistantMessage(state: AssistantStreamAssembly): AssistantStreamAssembly {
  const timeline = [...state.timeline];

  while (timeline.length > 0) {
    const last = timeline[timeline.length - 1];
    if (last?.kind !== "assistant" && last?.kind !== "activity") break;
    timeline.pop();
  }

  return {
    ...state,
    timeline,
    assistantStream: "",
  };
}
