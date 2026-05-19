import type { ReactElement } from "react";

import { AgentActivityBlock } from "@/features/agent-chat/AgentActivityBlock";
import { AssistantTurnBlock } from "@/features/agent-chat/AssistantTurnBlock";
import type { TranscriptRenderItem } from "@/features/agent-chat/transcriptRender";
import type { TranscriptCopyControl } from "@/features/agent-chat/useTranscriptCopyControl";

export type TranscriptRenderRowProps = {
  readonly item: TranscriptRenderItem;
  readonly canRegenerateAssistant: boolean;
  readonly isLastRenderItem: boolean;
  readonly createCopyControl: (copyId: string, text: string) => TranscriptCopyControl;
  readonly onRegenerateAssistant: () => void;
};

export function TranscriptRenderRow(props: TranscriptRenderRowProps): ReactElement {
  switch (props.item.kind) {
    case "user":
      return (
        <div className="w-full">
          <p className="text-sm bg-[#161616] px-3 py-2.5 mb-4 rounded-xl whitespace-pre-wrap text-[#cdcdcd]">
            {props.item.text}
          </p>
        </div>
      );
    case "activity":
      return <AgentActivityBlock rows={props.item.rows} status={props.item.status} />;
    case "assistant-turn":
      return (
        <AssistantTurnBlock
          turn={props.item}
          copyControl={props.createCopyControl(props.item.id, props.item.copyText)}
          onRegenerate={
            props.canRegenerateAssistant && props.isLastRenderItem && !props.item.isStreaming
              ? props.onRegenerateAssistant
              : undefined
          }
        />
      );
    default: {
      const _never: never = props.item;
      return _never;
    }
  }
}

export function transcriptRenderRowKey(item: TranscriptRenderItem): string {
  return item.kind === "assistant-turn" ? `turn-${item.id}` : item.id;
}
