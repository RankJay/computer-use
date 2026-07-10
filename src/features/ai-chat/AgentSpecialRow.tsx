import type { ReactElement } from "react";

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

import type { AgentChainOfThoughtRow, AgentTaskRow, AgentTranscriptRow } from "./types";

export type AgentSpecialRowProps = {
  readonly row: Exclude<AgentTranscriptRow, { type: "message" } | { type: "marker" }>;
};

export function AgentSpecialRow({ row }: AgentSpecialRowProps): ReactElement | null {
  switch (row.type) {
    case "chain-of-thought":
      return <AgentChainOfThoughtRowView row={row} />;
    case "task":
      return <AgentTaskRowView row={row} />;
    default: {
      const _exhaustive: never = row;
      return _exhaustive;
    }
  }
}

function AgentChainOfThoughtRowView({
  row,
}: {
  readonly row: AgentChainOfThoughtRow;
}): ReactElement {
  return (
    <ChainOfThought defaultOpen>
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

function AgentTaskRowView({ row }: { readonly row: AgentTaskRow }): ReactElement {
  return (
    <Task defaultOpen>
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
