import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { AgentActivityRow, AgentTimelineItem } from "@/agent/types";
import {
  agentChatBrowserAdapter,
  COPIED_FEEDBACK_DURATION_MS,
  STREAMING_ASSISTANT_COPY_ID,
} from "@/components/agent/agentChatBrowserAdapter";
import { Check, CheckCircle2, CircleAlert, Copy, Loader2, RotateCw } from "lucide-react";

const AgentMarkdown = lazy(async () => {
  const module = await import("@/components/agent/AgentMarkdown");
  return { default: module.AgentMarkdown };
});

export type AgentChatTranscriptProps = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly assistantStream: string;
  readonly canRegenerateAssistant: boolean;
  readonly onRegenerateAssistant: () => void;
};

type CopyControl = {
  readonly isCopied: boolean;
  readonly isCopyDisabled: boolean;
  readonly onCopy: () => void;
};

export function AgentChatTranscript(props: AgentChatTranscriptProps): ReactElement {
  const anchorRef = useRef<HTMLDivElement>(null);
  const resetCopiedStatusRef = useRef<(() => void) | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useLayoutEffect(() => {
    anchorRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [props.timeline, props.assistantStream]);

  useEffect(() => {
    return () => {
      resetCopiedStatusRef.current?.();
    };
  }, []);

  const resetCopiedStatusLater = useCallback((copyId: string) => {
    resetCopiedStatusRef.current?.();
    resetCopiedStatusRef.current = agentChatBrowserAdapter.schedule(() => {
      resetCopiedStatusRef.current = null;
      setCopiedMessageId((currentCopyId) => (currentCopyId === copyId ? null : currentCopyId));
    }, COPIED_FEEDBACK_DURATION_MS);
  }, []);

  const copyResponse = useCallback(
    async (copyId: string, text: string) => {
      if (text.trim().length === 0) return;

      const copied = await agentChatBrowserAdapter.writeClipboardText(text);
      if (!copied) return;

      setCopiedMessageId(copyId);
      resetCopiedStatusLater(copyId);
    },
    [resetCopiedStatusLater],
  );

  const createCopyControl = useCallback(
    (copyId: string, text: string): CopyControl => ({
      isCopied: copiedMessageId === copyId,
      isCopyDisabled: text.trim().length === 0,
      onCopy: () => {
        void copyResponse(copyId, text);
      },
    }),
    [copiedMessageId, copyResponse],
  );

  const last = props.timeline.length > 0 ? props.timeline[props.timeline.length - 1] : undefined;

  return (
    <div className="min-h-0 flex-1 space-y-8 p-4 overflow-y-auto overscroll-contain scrollbar-none">
      {props.timeline.map((item) => {
        switch (item.kind) {
          case "user":
            return (
              <div key={item.id} className="max-w-xl">
                <p className="text-sm whitespace-pre-wrap text-[#fefefe]">
                  {item.text}
                </p>
              </div>
            );
          case "activity":
            return (
              <AgentActivityBlock
                key={item.id}
                rows={item.rows}
                status={item.status}
              />
            );
          case "assistant":
            return (
              <AssistantBlock
                key={item.id}
                copyControl={createCopyControl(item.id, item.text)}
                markdown={item.text}
                onRegenerate={
                  props.canRegenerateAssistant &&
                  last?.kind === "assistant" &&
                  last.id === item.id
                    ? props.onRegenerateAssistant
                    : undefined
                }
              />
            );
          default: {
            const _never: never = item;
            return _never;
          }
        }
      })}

      {props.assistantStream.trim() !== "" && (
        <div className="max-w-xl">
          <StreamingAssistantBlock
            copyControl={createCopyControl(STREAMING_ASSISTANT_COPY_ID, props.assistantStream)}
            text={props.assistantStream}
          />
        </div>
      )}

      <div ref={anchorRef} aria-hidden />
    </div>
  );
}

function AgentActivityBlock(props: {
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed";
}): ReactElement | null {
  if (props.rows.length === 0) return null;

  const latest = props.rows[props.rows.length - 1];
  const isActive = props.status === "active";

  return (
    <details
      open={isActive}
      className="group max-w-xl rounded-xl border border-white/7 bg-[#121212]/75 px-3 py-2 text-xs text-neutral-500"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-neutral-500 hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <ActivityStatusIcon status={props.status} />
        <span className="min-w-0 flex-1 truncate">
          {isActive ? "Working" : props.status === "failed" ? "Stopped" : "Worked"}{" "}
          <span className="text-neutral-600">({props.rows.length})</span>
          {latest !== undefined && (
            <span className="ml-2 font-normal text-neutral-600">{latest.title}</span>
          )}
        </span>
      </summary>
      <ol className="mt-2 space-y-2 border-t border-white/7 pt-2">
        {props.rows.map((row) => (
          <li key={row.id} className="space-y-0.5">
            <div className="leading-snug text-neutral-400">{row.title}</div>
            {row.detail !== undefined && row.detail.trim() !== "" && (
              <div className="whitespace-pre-wrap wrap-break-word text-[11px] leading-snug text-neutral-600">
                {row.detail}
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ActivityStatusIcon(props: {
  readonly status: "active" | "completed" | "failed";
}): ReactElement {
  switch (props.status) {
    case "active":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-500" />;
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80" />;
    case "failed":
      return <CircleAlert className="size-3.5 shrink-0 text-red-400/80" />;
    default: {
      const _never: never = props.status;
      return _never;
    }
  }
}

function AssistantBlock(props: {
  readonly markdown: string;
  readonly copyControl: CopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="max-w-xl space-y-2">
      <div className="text-sm wrap-break-word text-[#7E7E7E]">
        <AssistantMarkdown markdown={props.markdown} />
      </div>
      {/* <AssistantToolbar copyControl={props.copyControl} onRegenerate={props.onRegenerate} /> */}
    </div>
  );
}

function StreamingAssistantBlock(props: {
  readonly text: string;
  readonly copyControl: CopyControl;
}): ReactElement {
  return (
    <div className="space-y-2">
      <div className="text-[15px] leading-[1.62] wrap-break-word text-[#a1a1aa]">
        <AssistantMarkdown markdown={props.text} />
      </div>
      <AssistantToolbar copyControl={props.copyControl} />
    </div>
  );
}

function AssistantToolbar(props: {
  readonly copyControl: CopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-0.5 opacity-55 transition-opacity hover:opacity-95">
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

function AssistantMarkdown(props: { readonly markdown: string }): ReactElement {
  return (
    <Suspense fallback={null}>
      <AgentMarkdown markdown={props.markdown} />
    </Suspense>
  );
}
