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
