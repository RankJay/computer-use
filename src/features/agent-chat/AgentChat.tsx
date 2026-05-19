import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { AgentActivityRow, AgentTimelineItem } from "@/agent/types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  clipboardAdapter,
  COPIED_FEEDBACK_DURATION_MS,
} from "@/features/agent-chat/clipboardAdapter";
import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Check,
  Copy,
  Dot,
  ListChecks,
  Loader2,
  RotateCw,
  ShieldQuestion,
  Wrench,
} from "lucide-react";
import { Item } from "@/components/motion/stagger";
import { StreamingAssistantText } from "@/features/agent-chat/StreamingAssistantText";

const AgentMarkdown = lazy(async () => {
  const module = await import("@/features/agent-chat/AgentMarkdown");
  return { default: module.AgentMarkdown };
});

export type AgentChatTranscriptProps = {
  readonly timeline: readonly AgentTimelineItem[];
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
  }, [props.timeline]);

  useEffect(() => {
    return () => {
      resetCopiedStatusRef.current?.();
    };
  }, []);

  const resetCopiedStatusLater = useCallback((copyId: string) => {
    resetCopiedStatusRef.current?.();
    resetCopiedStatusRef.current = clipboardAdapter.schedule(() => {
      resetCopiedStatusRef.current = null;
      setCopiedMessageId((currentCopyId) => (currentCopyId === copyId ? null : currentCopyId));
    }, COPIED_FEEDBACK_DURATION_MS);
  }, []);

  const copyResponse = useCallback(
    async (copyId: string, text: string) => {
      if (text.trim().length === 0) return;

      const copied = await clipboardAdapter.writeClipboardText(text);
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
    <div className="min-h-0 flex-1 px-1.5 py-2 overflow-y-auto overscroll-contain scrollbar-none">
      {props.timeline.map((item) => {
        switch (item.kind) {
          case "user":
            return (
              <div key={item.id} className="w-full">
                <p className="text-sm bg-[#161616] px-3 py-2.5 mb-4 rounded-xl whitespace-pre-wrap text-[#cdcdcd]">
                  {item.text}
                </p>
              </div>
            );
          case "activity":
            return <AgentActivityBlock key={item.id} rows={item.rows} status={item.status} />;
          case "assistant":
            return (
              <AssistantBlock
                key={item.id}
                messageId={item.id}
                copyControl={createCopyControl(item.id, item.text)}
                isStreaming={item.status === "streaming"}
                markdown={item.text}
                onRegenerate={
                  props.canRegenerateAssistant &&
                  last?.kind === "assistant" &&
                  last.id === item.id &&
                  item.status === "complete"
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

      <div ref={anchorRef} aria-hidden />
    </div>
  );
}

function AgentActivityBlock(props: {
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed";
}): ReactElement | null {
  if (props.rows.length === 0) return null;

  const isActive = props.status === "active";

  return (
    <ChainOfThought defaultOpen={isActive} className="w-full text-sm mb-4 px-2.5 text-[#B7C1CC]">
      <ChainOfThoughtHeader className="text-[#7E7E7E] hover:text-[#cdcdcd]">
        {agentActivityHeading(props.status)}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="text-[#B7C1CC]">
        {props.rows.map((row, index) => (
          <ChainOfThoughtStep
            key={row.id}
            icon={activityStepIcon(row, isActive && index === props.rows.length - 1)}
            label={row.title}
            description={activityStepDescription(row)}
            status={activityStepStatus(props.status, index, props.rows.length)}
            className="**:[[class*='bg-border']]:bg-neutral-800"
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function agentActivityHeading(status: "active" | "completed" | "failed"): string {
  switch (status) {
    case "active":
      return "Here's what's happening";
    case "completed":
      return "Here's what happened";
    case "failed":
      return "Here's what ran";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

function activityStepStatus(
  status: "active" | "completed" | "failed",
  index: number,
  rowCount: number,
): "complete" | "active" | "pending" {
  if (status === "failed" && index === rowCount - 1) return "active";
  if (status === "active" && index === rowCount - 1) return "active";
  return "complete";
}

function activityStepIcon(row: AgentActivityRow, active: boolean): LucideIcon {
  if (active) return Loader2;

  const title = row.title.toLowerCase();
  if (title.startsWith("planned")) return ListChecks;
  if (title.includes("permission")) return ShieldQuestion;
  if (title.includes("screenshot")) return Camera;
  if (title.includes("running") || title.includes("finished")) return Wrench;
  return Dot;
}

function activityStepDescription(row: AgentActivityRow): ReactElement | string | undefined {
  const label = row.detail?.trim() ?? "";
  const src = row.screenshotDataUrl;

  if (src !== undefined) {
    return (
      <div className="space-y-2 pt-0.5">
        {label !== "" && (
          <span className="block whitespace-pre-wrap wrap-break-word text-[#9ca3af]">
            {row.detail}
          </span>
        )}
        <img
          src={src}
          alt={label !== "" ? label : "Screen capture"}
          className="max-w-full rounded-lg border border-neutral-700/70 bg-neutral-950/40 max-h-[min(420px,55vh)] w-auto object-contain object-left"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  if (label === "") return undefined;
  return <span className="whitespace-pre-wrap wrap-break-word">{row.detail}</span>;
}

function AssistantBlock(props: {
  readonly messageId: string;
  readonly markdown: string;
  readonly isStreaming: boolean;
  readonly copyControl: CopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="w-full space-y-2 mb-8 px-3">
      <div
        className={`text-sm wrap-break-word ${props.isStreaming ? "text-[#B7C1CC]" : "text-[#fefefe]"}`}
      >
        {props.isStreaming ? (
          <StreamingAssistantText key={props.messageId} text={props.markdown} />
        ) : (
          <AssistantMarkdown markdown={props.markdown} />
        )}
      </div>
      {!props.isStreaming && (
        <AssistantToolbar copyControl={props.copyControl} onRegenerate={props.onRegenerate} />
      )}
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
