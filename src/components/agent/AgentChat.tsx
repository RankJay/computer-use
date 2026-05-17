import { useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import type { AgentTimelineItem } from "@/agent/types";
import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { Check, Copy, RotateCw } from "lucide-react";

export type AgentChatTranscriptProps = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly assistantStream: string;
  readonly canRegenerateAssistant: boolean;
  readonly onRegenerateAssistant: () => void;
};

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function AgentChatTranscript(props: AgentChatTranscriptProps): ReactElement {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    anchorRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [props.timeline, props.assistantStream]);

  const last = props.timeline.length > 0 ? props.timeline[props.timeline.length - 1] : undefined;

  return (
    <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain py-8">
      {props.timeline.map((item) =>
        item.kind === "user" ? (
          <div key={item.id} className="max-w-xl">
            <p className="text-[17px] leading-snug font-medium whitespace-pre-wrap text-[#fefefe]">
              {item.text}
            </p>
          </div>
        ) : (
          <AssistantBlock
            key={item.id}
            id={item.id}
            markdown={item.text}
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            canRegenerate={
              props.canRegenerateAssistant && last?.kind === "assistant" && last.id === item.id
            }
            onRegenerate={props.onRegenerateAssistant}
          />
        ),
      )}

      {props.assistantStream.trim() !== "" && (
        <div className="max-w-xl">
          <StreamingAssistantBlock
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            text={props.assistantStream}
          />
        </div>
      )}

      <div ref={anchorRef} aria-hidden />
    </div>
  );
}

function AssistantBlock(props: {
  readonly id: string;
  readonly markdown: string;
  readonly copiedId: string | null;
  readonly setCopiedId: Dispatch<SetStateAction<string | null>>;
  readonly canRegenerate: boolean;
  readonly onRegenerate: () => void;
}): ReactElement {
  return (
    <div className="max-w-xl space-y-2">
      <div className="text-[15px] leading-[1.62] break-words text-[#a1a1aa]">
        <AgentMarkdown markdown={props.markdown} />
      </div>
      <AssistantToolbar
        copiedId={props.copiedId}
        copiedKey={props.id}
        canRegenerate={props.canRegenerate}
        onRegenerate={props.onRegenerate}
        setCopiedId={props.setCopiedId}
        showRegenerate={true}
        text={props.markdown}
      />
    </div>
  );
}

function StreamingAssistantBlock(props: {
  readonly text: string;
  readonly copiedId: string | null;
  readonly setCopiedId: Dispatch<SetStateAction<string | null>>;
}): ReactElement {
  return (
    <div className="space-y-2">
      <div className="text-[15px] leading-[1.62] break-words text-[#a1a1aa]">
        <AgentMarkdown markdown={props.text} />
      </div>
      <AssistantToolbar
        copiedId={props.copiedId}
        copiedKey="streaming"
        canRegenerate={false}
        onRegenerate={() => {}}
        setCopiedId={props.setCopiedId}
        showRegenerate={false}
        text={props.text}
      />
    </div>
  );
}

function AssistantToolbar(props: {
  readonly text: string;
  readonly copiedKey: string;
  readonly copiedId: string | null;
  readonly setCopiedId: Dispatch<SetStateAction<string | null>>;
  readonly showRegenerate: boolean;
  readonly canRegenerate: boolean;
  readonly onRegenerate: () => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-0.5 opacity-55 transition-opacity hover:opacity-95">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
        aria-label={props.copiedId === props.copiedKey ? "Copied" : "Copy response"}
        disabled={props.text.trim().length === 0}
        onClick={() =>
          void (async () => {
            const ok = await writeClipboard(props.text);
            if (!ok) return;
            props.setCopiedId(props.copiedKey);
            window.setTimeout(() => {
              props.setCopiedId((prev: string | null) => (prev === props.copiedKey ? null : prev));
            }, 2200);
          })()
        }
      >
        {props.copiedId === props.copiedKey ? (
          <Check className="size-3.5 text-emerald-400" strokeWidth={2} />
        ) : (
          <Copy className="size-3.5" strokeWidth={2} />
        )}
      </Button>
      {props.showRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!props.canRegenerate}
          className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Regenerate response"
          title={
            props.canRegenerate ? undefined : "Wait until the assistant has finished responding"
          }
          onClick={props.onRegenerate}
        >
          <RotateCw className="size-3.5" strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
