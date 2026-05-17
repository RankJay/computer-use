import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import type { AgentEvent, AgentRunStatus } from "@/agent/types";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  ListTree,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";

function formatEventTitle(event: AgentEvent): string {
  switch (event.type) {
    case "task.created":
      return "Task created";
    case "plan.updated":
      return "Plan updated";
    case "step.started":
      return `Step started: ${event.title}`;
    case "step.completed":
      return `Step completed (${event.stepIndex})`;
    case "permission.requested":
      return "Permission requested";
    case "permission.resolved":
      return `Permission resolved (${event.choice})`;
    case "tool.started":
      return `Tool started: ${event.toolName}`;
    case "tool.completed":
      return `Tool completed: ${event.toolName}`;
    case "screenshot.keyframe":
      return `Screenshot: ${event.label}`;
    case "assistant.text.delta":
      return "Assistant streaming";
    case "assistant.text.done":
      return "Assistant message complete";
    case "task.completed":
      return "Task completed";
    case "task.failed":
      return "Task failed";
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

export type AgentEventLogProps = {
  readonly events: readonly AgentEvent[];
};

export function AgentEventLog(props: AgentEventLogProps): ReactElement | null {
  const rows = props.events.filter((e) => e.type !== "assistant.text.delta");
  if (rows.length === 0) {
    return null;
  }

  return (
    <details className="group shrink-0 rounded-xl border border-neutral-800/80 bg-[#0c0c0c]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <ListTree className="size-3.5 shrink-0" aria-hidden />
        <span>
          Execution log <span className="text-neutral-600">({rows.length})</span>
        </span>
      </summary>
      <div className="max-h-36 overflow-y-auto overscroll-contain border-t border-neutral-800/80 px-3 py-2">
        <ol className="space-y-1.5 text-[11px] leading-snug text-neutral-500">
          {rows.map((event) => (
            <li key={event.id} className="wrap-break-word pl-0.5">
              {formatEventTitle(event)}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export function lastTaskFailedMessage(events: readonly AgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "task.failed") {
      return e.message;
    }
  }
  return null;
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
