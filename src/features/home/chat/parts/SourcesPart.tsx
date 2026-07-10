import type { SourceUrlUIPart } from "ai";
import { memo, type ReactElement } from "react";

import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";

export type SourcesPartProps = {
  readonly parts: readonly SourceUrlUIPart[];
};

export const SourcesPart = memo(function SourcesPart({ parts }: SourcesPartProps): ReactElement {
  return (
    <Sources>
      <SourcesTrigger count={parts.length} />
      <SourcesContent>
        {parts.map((part) => (
          <Source href={part.url} key={part.sourceId} title={part.title ?? part.url} />
        ))}
      </SourcesContent>
    </Sources>
  );
});
