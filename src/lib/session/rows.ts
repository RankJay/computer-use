import type { UIMessage } from "ai";

import type {
  ActivityChainUpdatedPayload,
  ActivityMarkerPayload,
  ActivityTaskUpdatedPayload,
} from "./events";

/** Presentation row: event markerId → row id; wire fields from ActivityMarkerPayload. */
export type AgentMarkerRow = {
  type: "marker";
  id: string;
} & Pick<ActivityMarkerPayload, "variant" | "text" | "live" | "status">;

export type AgentMessageRowData = {
  type: "message";
  id: string;
  message: UIMessage;
  scrollAnchor?: boolean;
};

export type AgentChainOfThoughtStep = ActivityChainUpdatedPayload["steps"][number];

export type AgentChainOfThoughtRow = {
  type: "chain-of-thought";
  id: string;
  steps: AgentChainOfThoughtStep[];
};

export type AgentTaskItem = ActivityTaskUpdatedPayload["items"][number];

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
