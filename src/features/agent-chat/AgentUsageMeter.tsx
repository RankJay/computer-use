import { Package } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";

import type { AgentUsageSummary } from "@/agent/types";

export type AgentUsageMeterProps = {
  readonly usage: AgentUsageSummary;
};

export function AgentUsageMeter(props: AgentUsageMeterProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const totalTokens = props.usage.inputTokens + props.usage.outputTokens;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target instanceof Node ? event.target : null)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  if (totalTokens === 0 && props.usage.costUsd === 0) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-10 mb-3 flex justify-end bg-[#0E0E0E]/90 py-1 backdrop-blur"
    >
      <div className="relative">
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-[#161616]/95 text-[#A8A8A8] shadow-sm transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-white/20 hover:bg-[#1D1D1D] hover:text-[#E5E5E5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 active:scale-[0.97] motion-reduce:transition-none"
          aria-label="Show run usage"
          aria-expanded={open}
          aria-controls={popupId}
          onClick={() => setOpen((value) => !value)}
        >
          <Package className="size-3.5" aria-hidden />
        </button>

        {open && (
          <output
            id={popupId}
            aria-live="polite"
            className="absolute right-0 top-9 w-64 origin-top-right rounded-2xl border border-white/10 bg-[#151515] p-3 text-xs text-[#D6D6D6] shadow-2xl shadow-black/40 ring-1 ring-black/20 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium tracking-tight text-[#CDCDCD]">
              Context usage
            </div>
            <UsageRow label="Estimated cost" value={formatUsd(props.usage.costUsd)} />
            <UsageRow label="Input tokens" value={formatTokenCount(props.usage.inputTokens)} />
            <UsageRow label="Output tokens" value={formatTokenCount(props.usage.outputTokens)} />
            <UsageRow
              label="Cache read"
              value={formatTokenCount(props.usage.cacheReadInputTokens)}
            />
            <UsageRow
              label="Cache write"
              value={formatTokenCount(props.usage.cacheWriteInputTokens)}
            />
          </output>
        )}
      </div>
    </div>
  );
}

function UsageRow(props: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/6 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-[#8E8E8E]">{props.label}</span>
      <span className="text-xs tracking-tight text-[#E8E8E8]">{props.value}</span>
    </div>
  );
}

function formatUsd(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(3)}`;
}

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(tokens);
}
