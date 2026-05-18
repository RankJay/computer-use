import type { ReactElement } from "react";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { AgentEventLogRow } from "@/agent/session/sessionProjection";
import type { AgentRunStatus } from "@/agent/types";
import { invoke } from "@tauri-apps/api/core";
import { TAURI_COMMAND } from "@/agent/native/tauriIpc";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  ListTree,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";

export type AgentEventLogProps = {
  readonly rows: readonly AgentEventLogRow[];
};

export function AgentEventLog(props: AgentEventLogProps): ReactElement | null {
  if (props.rows.length === 0) {
    return null;
  }

  return (
    <details className="group shrink-0 rounded-xl border border-neutral-800/80 bg-[#0c0c0c]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <ListTree className="size-3.5 shrink-0" aria-hidden />
        <span>
          Execution log <span className="text-neutral-600">({props.rows.length})</span>
        </span>
      </summary>
      <div className="max-h-36 overflow-y-auto overscroll-contain border-t border-neutral-800/80 px-3 py-2">
        <ol className="space-y-1.5 text-[11px] leading-snug text-neutral-500">
          {props.rows.map((row) => (
            <li key={row.id} className="wrap-break-word pl-0.5">
              {row.title}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export type PointerAutomationEscBarProps = {
  /** Enables global Esc listener to invoke cancel_pointer_automation. */
  readonly escArmActive: boolean;
  readonly pointerBusy: boolean;
};

/** Shown during UI automation; Esc invokes cancel_pointer_automation (honored between mouse steps / before click). */
export function PointerAutomationEscBar(props: PointerAutomationEscBarProps): ReactElement | null {
  useEffect(() => {
    if (!props.escArmActive) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") {
        return;
      }
      e.preventDefault();
      void invoke<void>(TAURI_COMMAND.cancelPointerAutomation).catch(() => {
        /** ignore invoke errors (capabilities / dev shells) */
      });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props.escArmActive]);

  if (!props.escArmActive) {
    return null;
  }

  return (
    <output className="block shrink-0 rounded-xl border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-[11px] leading-snug text-amber-100/95">
      <span className="font-medium text-amber-200/95">UI automation in progress.</span>{" "}
      {props.pointerBusy ? (
        <>
          Physical mouse input is swallowed so automation can steer the cursor — keep hands off
          until it finishes or you stop it with{" "}
        </>
      ) : (
        <>Press </>
      )}
      <kbd className="rounded border border-amber-800/70 bg-neutral-950/70 px-1 py-px font-mono text-[10px]">
        Esc
      </kbd>{" "}
      to cancel in-flight automation (effective between mouse steps and before clicks or typing
      bursts).
    </output>
  );
}

function statusLabel(status: AgentRunStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "awaiting_permission":
      return "Awaiting permission";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

function statusBadgeVariant(
  status: AgentRunStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "idle":
      return "secondary";
    case "running":
      return "default";
    case "awaiting_permission":
      return "outline";
    case "completed":
      return "secondary";
    case "failed":
      return "destructive";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

export type AgentRunRibbonProps = {
  readonly status: AgentRunStatus;
  readonly currentPlan: readonly string[];
  readonly currentStep: string | null;
  readonly lastSummary: string | null;
};

export function AgentRunRibbon(props: AgentRunRibbonProps): ReactElement | null {
  if (
    props.status === "idle" &&
    props.currentPlan.length === 0 &&
    (props.currentStep === null || props.currentStep === "") &&
    (props.lastSummary === null || props.lastSummary === "")
  ) {
    return null;
  }

  return (
    <div className="shrink-0 space-y-2 rounded-xl border border-neutral-800/90 bg-[#111111]/95 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-2">
        <Badge variant={statusBadgeVariant(props.status)} className="shrink-0 gap-1 capitalize">
          {props.status === "running" && <Loader2 className="size-3 shrink-0 animate-spin" />}
          {props.status === "awaiting_permission" && <ShieldQuestion className="size-3 shrink-0" />}
          {props.status === "completed" && (
            <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
          )}
          {props.status === "failed" && <CircleAlert className="size-3 shrink-0" />}
          {statusLabel(props.status)}
        </Badge>
        {props.currentStep !== null && props.currentStep !== "" && (
          <span className="min-w-0 flex-1 text-xs leading-snug text-neutral-400">
            <span className="text-neutral-600">Step </span>
            {props.currentStep}
          </span>
        )}
      </div>
      {props.status === "completed" &&
        props.lastSummary !== null &&
        props.lastSummary.trim() !== "" && (
          <p className="line-clamp-2 text-xs leading-relaxed text-neutral-500">
            <Sparkles className="mr-1 inline size-3 shrink-0 text-amber-400/90" aria-hidden />
            {props.lastSummary}
          </p>
        )}
      {props.currentPlan.length > 0 && (
        <div className="max-h-28 overflow-y-auto overscroll-contain border-t border-neutral-800/80 pt-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-600">
            Plan
          </div>
          <ol className="mt-1.5 space-y-1.5 text-xs text-neutral-400">
            {props.currentPlan.map((step, index) => (
              <li key={index} className="flex gap-2 leading-relaxed">
                <span className="w-4 shrink-0 font-mono text-[10px] text-neutral-600">
                  {index + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export type TaskFailureBannerProps = {
  readonly message: string;
};

export function TaskFailureBanner(props: TaskFailureBannerProps): ReactElement {
  return (
    <div
      className="rounded-xl border border-red-900/50 bg-red-950/35 px-3 py-2.5 text-sm leading-relaxed text-red-100"
      role="alert"
    >
      {props.message}
    </div>
  );
}
