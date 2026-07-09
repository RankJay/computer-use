import type { UIMessage } from "ai";

export type AgentMarkerRow = {
  type: "marker";
  id: string;
  variant?: "default" | "separator" | "border";
  text: string;
  live?: boolean;
  status?: boolean;
};

export type AgentMessageRowData = {
  type: "message";
  id: string;
  message: UIMessage;
  scrollAnchor?: boolean;
};

export type AgentChainOfThoughtStep = {
  label: string;
  description?: string;
  status?: "complete" | "active" | "pending";
  searchResults?: string[];
};

export type AgentChainOfThoughtRow = {
  type: "chain-of-thought";
  id: string;
  steps: AgentChainOfThoughtStep[];
};

export type AgentTaskItem = string | { text: string; file?: { name: string } };

export type AgentTaskRow = {
  type: "task";
  id: string;
  title: string;
  items: AgentTaskItem[];
};

export type AgentTranscriptRow =
  | AgentMarkerRow
  | AgentMessageRowData
  | AgentChainOfThoughtRow
  | AgentTaskRow;

export type TranscriptStatus = "idle" | "streaming" | "completed" | "cancelled";

export type TranscriptState = {
  rows: AgentTranscriptRow[];
  streamingMessageId: string | null;
  status: TranscriptStatus;
};

/** JSON-serializable UI message part for demo event payloads. */
export type UIMessagePartSnapshot = UIMessage["parts"][number];

export type DemoRuntimeEvent =
  | {
      type: "activity.marker";
      eventId: string;
      markerId: string;
      variant?: "default" | "separator" | "border";
      text: string;
      live?: boolean;
      status?: boolean;
    }
  | {
      type: "task.started";
      eventId: string;
      prompt: string;
      modelId: string;
      userMessageId?: string;
    }
  | {
      type: "task.status_changed";
      eventId: string;
      status: TranscriptStatus | "running" | "waiting_permission" | "paused" | "failed";
    }
  | {
      type: "task.completed";
      eventId: string;
      finishReason: "stop" | "budget" | "cancelled" | "error";
    }
  | {
      type: "assistant.message_started";
      eventId: string;
      messageId: string;
      role: "assistant";
    }
  | {
      type: "assistant.part_updated";
      eventId: string;
      messageId: string;
      partIndex: number;
      part: UIMessagePartSnapshot;
    }
  | {
      type: "assistant.message_finished";
      eventId: string;
      messageId: string;
    }
  | {
      type: "activity.chain_updated";
      eventId: string;
      chainId: string;
      steps: AgentChainOfThoughtStep[];
    }
  | {
      type: "activity.task_updated";
      eventId: string;
      activityTaskId: string;
      title: string;
      items: AgentTaskItem[];
    }
  | {
      type: "usage.updated";
      eventId: string;
      modelId: string;
      usedTokens: number;
      maxTokens: number;
    };

export function createEmptyTranscriptState(): TranscriptState {
  return {
    rows: [],
    streamingMessageId: null,
    status: "idle",
  };
}
