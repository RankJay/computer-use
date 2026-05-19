import type { LucideIcon } from "lucide-react";
import { Camera, Dot, ListChecks, Loader2, ShieldQuestion, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import type { AgentActivityRow } from "@/agent/types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";

export type AgentActivityBlockProps = {
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed";
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

  return (
    <ChainOfThought
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full text-sm px-3 mb-4 text-[#B7C1CC]"
    >
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
