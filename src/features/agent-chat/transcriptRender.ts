import type { AgentActivityRow, AgentTimelineItem } from "@/agent/types";
import { joinAssistantText } from "@/features/agent-chat/transcriptTextJoin";

export type TranscriptUserItem = {
  readonly kind: "user";
  readonly id: string;
  readonly text: string;
};

export type TranscriptActivityItem = {
  readonly kind: "activity";
  readonly id: string;
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed";
};

export type TranscriptAssistantTextPart = {
  readonly kind: "text";
  readonly text: string;
  readonly isStreaming: boolean;
};

export type TranscriptAssistantTurnItem = {
  readonly kind: "assistant-turn";
  readonly id: string;
  readonly parts: readonly (TranscriptAssistantTextPart | TranscriptActivityItem)[];
  readonly copyText: string;
  readonly isStreaming: boolean;
};

export type TranscriptRenderItem =
  | TranscriptUserItem
  | TranscriptActivityItem
  | TranscriptAssistantTurnItem;

/** Groups timeline rows for display so tool activity does not split one assistant reply. */
export function buildTranscriptRenderItems(
  timeline: readonly AgentTimelineItem[],
): readonly TranscriptRenderItem[] {
  const items: TranscriptRenderItem[] = [];
  let index = 0;

  while (index < timeline.length) {
    const item = timeline[index];

    if (item.kind === "user") {
      items.push({ kind: "user", id: item.id, text: item.text });
      index += 1;
      continue;
    }

    if (item.kind === "activity") {
      items.push(toActivityItem(item));
      index += 1;
      continue;
    }

    if (item.kind === "assistant") {
      const turn = collectAssistantTurn(timeline, index);
      items.push(turn.item);
      index = turn.nextIndex;
      continue;
    }

    index += 1;
  }

  return items;
}

function collectAssistantTurn(
  timeline: readonly AgentTimelineItem[],
  startIndex: number,
): { readonly item: TranscriptAssistantTurnItem; readonly nextIndex: number } {
  const parts: Array<TranscriptAssistantTextPart | TranscriptActivityItem> = [];
  let copyText = "";
  let turnId = "";
  let isStreaming = false;
  let index = startIndex;

  while (index < timeline.length) {
    const item = timeline[index];

    if (item.kind === "assistant") {
      if (turnId.length === 0) {
        turnId = item.id;
      }

      pushAssistantTextPart(parts, item.text, item.status === "streaming");
      copyText = joinAssistantText(copyText, item.text);
      isStreaming = isStreaming || item.status === "streaming";
      index += 1;

      if (index < timeline.length && timeline[index]?.kind === "activity") {
        index = appendActivityParts(timeline, index, parts);
        continue;
      }

      if (index < timeline.length && timeline[index]?.kind === "assistant") {
        continue;
      }

      break;
    }

    if (item.kind === "activity") {
      index = appendActivityParts(timeline, index, parts);
      continue;
    }

    break;
  }

  return {
    item: {
      kind: "assistant-turn",
      id: turnId,
      parts,
      copyText,
      isStreaming,
    },
    nextIndex: index,
  };
}

function appendActivityParts(
  timeline: readonly AgentTimelineItem[],
  startIndex: number,
  parts: Array<TranscriptAssistantTextPart | TranscriptActivityItem>,
): number {
  let index = startIndex;

  while (index < timeline.length && timeline[index]?.kind === "activity") {
    const activity = timeline[index];
    if (activity?.kind === "activity") {
      parts.push(toActivityItem(activity));
    }
    index += 1;
  }

  return index;
}

function pushAssistantTextPart(
  parts: Array<TranscriptAssistantTextPart | TranscriptActivityItem>,
  text: string,
  isStreaming: boolean,
): void {
  const last = parts[parts.length - 1];
  if (last?.kind === "text") {
    parts[parts.length - 1] = {
      kind: "text",
      text: joinAssistantText(last.text, text),
      isStreaming: last.isStreaming || isStreaming,
    };
    return;
  }

  parts.push({ kind: "text", text, isStreaming });
}

function toActivityItem(
  item: Extract<AgentTimelineItem, { kind: "activity" }>,
): TranscriptActivityItem {
  return {
    kind: "activity",
    id: item.id,
    rows: item.rows,
    status: item.status,
  };
}
