import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Camera,
  ChevronDown,
  Dot,
  ListChecks,
  Loader2,
  ShieldQuestion,
  TimerOff,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import type { AgentActivityRow } from "@/agent/types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { cn } from "@/lib/utils";

type ActivitySurface = NonNullable<AgentActivityRow["surface"]>;

type ActivitySegment = {
  readonly surface: ActivitySurface;
  readonly rows: readonly AgentActivityRow[];
};

export type AgentActivityBlockProps = {
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed" | "cancelled";
  readonly collapse?: boolean;
};

export function AgentActivityBlock(props: AgentActivityBlockProps): ReactElement | null {
  const isActive = props.status === "active";
  const shouldAutoOpen = isActive && props.collapse !== true;
  const [isOpen, setIsOpen] = useState(shouldAutoOpen);

  useEffect(() => {
    setIsOpen(shouldAutoOpen);
  }, [shouldAutoOpen]);

  if (props.rows.length === 0) return null;

  const heading = agentActivityHeading(props.status);
  const segments = activitySegments(props.rows);

  return (
    <>
      {segments.map((segment, segmentIndex) => {
        const segmentActive = isActive && segmentIndex === segments.length - 1;
        const key = `${segment.surface}-${segment.rows[0]?.id ?? segmentIndex}`;

        switch (segment.surface) {
          case "reasoning":
            return (
              <ReasoningActivitySegment
                key={key}
                rows={segment.rows}
                heading={heading}
                isActive={segmentActive}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
              />
            );
          case "task":
            return (
              <TaskActivitySegment
                key={key}
                rows={segment.rows}
                heading={heading}
                status={props.status}
                isActive={segmentActive}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
              />
            );
          case "thought":
            return (
              <ThoughtActivitySegment
                key={key}
                rows={segment.rows}
                heading={heading}
                status={props.status}
                isActive={segmentActive}
                isOpen={isOpen}
                onOpenChange={setIsOpen}
              />
            );
          default: {
            const _never: never = segment.surface;
            return _never;
          }
        }
      })}
    </>
  );
}

type ActivitySegmentProps = {
  readonly rows: readonly AgentActivityRow[];
  readonly heading: string;
  readonly isActive: boolean;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

type StatusActivitySegmentProps = ActivitySegmentProps & {
  readonly status: "active" | "completed" | "failed" | "cancelled";
};

function ThoughtActivitySegment(props: StatusActivitySegmentProps): ReactElement {
  return (
    <ChainOfThought
      open={props.isOpen}
      onOpenChange={props.onOpenChange}
      className="w-full text-sm px-3 mb-4 text-[#B7C1CC]"
    >
      <ChainOfThoughtHeader className="text-[#7E7E7E] hover:text-[#cdcdcd]">
        {activityHeadingContent(props.heading, props.isActive)}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="text-[#B7C1CC]">
        {props.rows.map((row, index) => (
          <ChainOfThoughtStep
            key={row.id}
            icon={activityStepIcon(row, props.isActive && index === props.rows.length - 1)}
            iconClassName={
              props.isActive && index === props.rows.length - 1 ? spinnerIconClassName : undefined
            }
            label={row.title}
            description={activityStepDescription(row)}
            status={activityStepStatus(props.status, index, props.rows.length)}
            className={cn(
              "**:[[class*='bg-border']]:bg-neutral-800",
              activityRowClassName(row, props.status, index, props.rows.length),
            )}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function ReasoningActivitySegment(props: ActivitySegmentProps): ReactElement {
  return (
    <Reasoning
      open={props.isOpen}
      onOpenChange={props.onOpenChange}
      isStreaming={props.isActive}
      className="w-full px-3 mb-4 text-sm text-[#B7C1CC]"
    >
      <ReasoningTrigger
        className="text-[#7E7E7E] hover:text-[#cdcdcd]"
        getThinkingMessage={() => activityHeadingContent(props.heading, props.isActive)}
      />
      <ReasoningContent className="mt-1.5 text-[#B7C1CC]">
        {reasoningContent(props.rows)}
      </ReasoningContent>
    </Reasoning>
  );
}

function TaskActivitySegment(props: StatusActivitySegmentProps): ReactElement {
  return (
    <Task
      open={props.isOpen}
      onOpenChange={props.onOpenChange}
      className="w-full px-3 mb-4 text-sm text-[#B7C1CC]"
    >
      <TaskTrigger title={props.heading}>
        <button
          type="button"
          className="group flex w-full items-center gap-1.5 text-[#7E7E7E] text-sm transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#cdcdcd] motion-reduce:transition-none"
        >
          <ListChecks className="size-3.5 shrink-0" />
          <span className="flex-1 text-left leading-snug">
            {activityHeadingContent(props.heading, props.isActive)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </button>
      </TaskTrigger>
      <TaskContent className="text-[#B7C1CC]">
        {props.rows.map((row, index) => (
          <ActivityTaskItem
            key={row.id}
            row={row}
            active={props.isActive && index === props.rows.length - 1}
            status={activityStepStatus(props.status, index, props.rows.length)}
          />
        ))}
      </TaskContent>
    </Task>
  );
}

type ActivityTaskItemProps = {
  readonly row: AgentActivityRow;
  readonly active: boolean;
  readonly status: "complete" | "active" | "pending";
};

function ActivityTaskItem(props: ActivityTaskItemProps): ReactElement {
  const Icon = activityStepIcon(props.row, props.active);
  const description = activityStepDescription(props.row);

  return (
    <TaskItem
      className={cn(
        "flex gap-1.5 text-sm leading-snug",
        stepStatusStyles[props.status],
        activityRowClassName(props.row, props.status),
      )}
    >
      <Icon
        className={cn(
          "mt-px size-3.5 shrink-0",
          props.active && spinnerIconClassName,
          activityIconClassName(props.row),
        )}
      />
      <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
        <div className="text-xs font-medium">{props.row.title}</div>
        {description !== undefined && (
          <div className="text-muted-foreground text-xs leading-snug">{description}</div>
        )}
      </div>
    </TaskItem>
  );
}

function activityHeadingContent(heading: string, isActive: boolean): ReactNode {
  if (isActive && heading === "Here's what's happening") {
    return (
      <Shimmer
        as="span"
        duration={1.25}
        className="[--shimmer-base:#9ca3af] [--shimmer-highlight:#cdcdcd]"
      >
        {heading}
      </Shimmer>
    );
  }

  return heading;
}

function activitySegments(rows: readonly AgentActivityRow[]): readonly ActivitySegment[] {
  const segments: ActivitySegment[] = [];

  for (const row of rows) {
    const surface = activitySurface(row);
    const last = segments[segments.length - 1];

    if (last?.surface === surface) {
      segments[segments.length - 1] = { ...last, rows: [...last.rows, row] };
      continue;
    }

    segments.push({ surface, rows: [row] });
  }

  return segments;
}

function activitySurface(row: AgentActivityRow): ActivitySurface {
  if (row.surface !== undefined) return row.surface;

  const title = row.title.toLowerCase();
  if (title.includes("reasoning")) return "reasoning";
  if (
    title.includes("workspace.inspect") ||
    title.includes("file.read") ||
    title.includes("file.write")
  ) {
    return "task";
  }
  return "thought";
}

function reasoningContent(rows: readonly AgentActivityRow[]): string {
  return rows
    .map((row) => (row.detail !== undefined ? `${row.title}\n\n${row.detail}` : row.title))
    .join("\n\n");
}

function agentActivityHeading(status: "active" | "completed" | "failed" | "cancelled"): string {
  switch (status) {
    case "active":
      return "Here's what's happening";
    case "completed":
      return "Here's what happened";
    case "failed":
      return "Here's what ran";
    case "cancelled":
      return "Stopped";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

function activityStepStatus(
  status: "active" | "completed" | "failed" | "cancelled",
  index: number,
  rowCount: number,
): "complete" | "active" | "pending" {
  if (status === "failed" && index === rowCount - 1) return "active";
  if (status === "active" && index === rowCount - 1) return "active";
  return "complete";
}

const stepStatusStyles = {
  active: "text-[#cdcdcd]",
  complete: "text-[#B7C1CC]",
  pending: "text-[#B7C1CC]/50",
};

const spinnerIconClassName = "origin-center animate-spin transform-view";

function activityStepIcon(row: AgentActivityRow, active: boolean): LucideIcon {
  if (active) return Loader2;

  if (row.tone === "timeout") return TimerOff;
  const title = row.title.toLowerCase();
  if (title.startsWith("cancelled")) return Ban;
  if (title.startsWith("planned")) return ListChecks;
  if (title.includes("permission")) return ShieldQuestion;
  if (title.includes("screenshot")) return Camera;
  if (title.includes("running") || title.includes("finished")) return Wrench;
  return Dot;
}

function activityRowClassName(
  row: AgentActivityRow,
  status: "complete" | "active" | "pending" | "completed" | "failed" | "cancelled",
  index?: number,
  rowCount?: number,
): string | undefined {
  const isFailedFinalRow = status === "failed" && index !== undefined && rowCount === index + 1;
  if (row.tone === "timeout" && !isFailedFinalRow) return "text-amber-300";
  return undefined;
}

function activityIconClassName(row: AgentActivityRow): string | undefined {
  if (row.tone === "timeout") return "text-amber-300";
  return undefined;
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
