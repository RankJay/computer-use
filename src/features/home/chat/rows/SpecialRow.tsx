import { memo, type ReactElement } from "react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";

import type { AgentChainOfThoughtRow, AgentTaskRow, AgentTranscriptRow } from "../types";

export type SpecialRowProps = {
  readonly row: Exclude<AgentTranscriptRow, { type: "message" } | { type: "marker" }>;
};

export const SpecialRow = memo(function SpecialRow({ row }: SpecialRowProps): ReactElement | null {
  switch (row.type) {
    case "chain-of-thought":
      return <ChainOfThoughtRowView row={row} />;
    case "task":
      return <TaskRowView row={row} />;
    default: {
      const _exhaustive: never = row;
      return _exhaustive;
    }
  }
});

function ChainOfThoughtRowView({ row }: { readonly row: AgentChainOfThoughtRow }): ReactElement {
  return (
    <ChainOfThought defaultOpen className="px-2">
      <ChainOfThoughtHeader />
      <ChainOfThoughtContent>
        {row.steps.map((step) => (
          <ChainOfThoughtStep
            description={step.description}
            key={step.label}
            label={step.label}
            status={step.status ?? "complete"}
          >
            {step.searchResults ? (
              <ChainOfThoughtSearchResults>
                {step.searchResults.map((result) => (
                  <ChainOfThoughtSearchResult key={result}>{result}</ChainOfThoughtSearchResult>
                ))}
              </ChainOfThoughtSearchResults>
            ) : null}
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function TaskRowView({ row }: { readonly row: AgentTaskRow }): ReactElement {
  return (
    <Task defaultOpen className="px-2">
      <TaskTrigger title={row.title} />
      <TaskContent>
        {row.items.map((item, index) => (
          <TaskItem key={`${row.id}-item-${index}`}>
            {typeof item === "string" ? (
              item
            ) : (
              <>
                {item.text} {item.file ? <TaskItemFile>{item.file.name}</TaskItemFile> : null}
              </>
            )}
          </TaskItem>
        ))}
      </TaskContent>
    </Task>
  );
}
