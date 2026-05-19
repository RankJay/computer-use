import { Check, Copy, RotateCw } from "lucide-react";
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { AgentActivityBlock } from "@/features/agent-chat/AgentActivityBlock";
import type { TranscriptRenderItem } from "@/features/agent-chat/transcriptRender";
import type { TranscriptCopyControl } from "@/features/agent-chat/useTranscriptCopyControl";

const AgentStreamMarkdown = lazy(async () => {
  const module = await import("@/features/agent-chat/AgentStreamMarkdown");
  return { default: module.AgentStreamMarkdown };
});

export type AssistantTurnBlockProps = {
  readonly turn: Extract<TranscriptRenderItem, { kind: "assistant-turn" }>;
  readonly copyControl: TranscriptCopyControl;
  readonly onRegenerate?: () => void;
};

export function AssistantTurnBlock(props: AssistantTurnBlockProps): ReactElement {
  return (
    <div className="w-full space-y-2 mb-8">
      {props.turn.parts.map((part, index) => {
        switch (part.kind) {
          case "text":
            return (
              <AssistantTextPart
                key={`${props.turn.id}-text-${index}`}
                markdown={part.text}
                isStreaming={part.isStreaming}
              />
            );
          case "activity":
            return (
              <AgentActivityBlock
                key={part.id}
                rows={part.rows}
                status={part.status}
                collapse={props.turn.isStreaming}
              />
            );
          default: {
            const _never: never = part;
            return _never;
          }
        }
      })}
      {!props.turn.isStreaming && (
        <AssistantToolbar copyControl={props.copyControl} onRegenerate={props.onRegenerate} />
      )}
    </div>
  );
}

function AssistantTextPart(props: {
  readonly markdown: string;
  readonly isStreaming: boolean;
}): ReactElement {
  return (
    <div className={`text-sm wrap-break-word text-[#fefefe]`}>
      <Suspense fallback={<span className="whitespace-pre-wrap">{props.markdown}</span>}>
        <AgentStreamMarkdown markdown={props.markdown} isStreaming={props.isStreaming} />
      </Suspense>
    </div>
  );
}

function AssistantToolbar(props: {
  readonly copyControl: TranscriptCopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="flex items-center opacity-55 transition-opacity hover:opacity-95">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
        aria-label={props.copyControl.isCopied ? "Copied" : "Copy response"}
        disabled={props.copyControl.isCopyDisabled}
        onClick={props.copyControl.onCopy}
      >
        {props.copyControl.isCopied ? (
          <Check className="size-3.5 text-emerald-400" strokeWidth={2} />
        ) : (
          <Copy className="size-3.5" strokeWidth={2} />
        )}
      </Button>
      {props.onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
          aria-label="Regenerate response"
          onClick={props.onRegenerate}
        >
          <RotateCw className="size-3.5" strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
