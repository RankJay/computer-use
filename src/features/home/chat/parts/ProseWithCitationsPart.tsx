import type { SourceUrlUIPart } from "ai";
import { createContext, memo, useContext, type ReactElement } from "react";
import type { ExtraProps } from "streamdown";

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

import { AssistantProseBubble } from "./AssistantProseBubble";
import {
  buildCitedMarkdown,
  PROSE_CITE_TAG,
  uniqueSources,
  type CitedTextSegment,
} from "./prose-citation-run";
import { SourcesPart } from "./SourcesPart";

export type ProseWithCitationsPartProps = {
  readonly summarySources: readonly SourceUrlUIPart[];
  readonly segments: readonly CitedTextSegment[];
  readonly isAnimating?: boolean;
};

const CiteGroupsContext = createContext<readonly (readonly SourceUrlUIPart[])[]>([]);

type CiteNodeProps = Record<string, unknown> & ExtraProps;

function sourceTriggerLabel(urls: readonly string[]): string {
  const first = urls[0];
  if (!first) return "source";
  let host = "source";
  try {
    host = new URL(first).hostname.replace(/^www\./, "");
  } catch {
    host = "source";
  }
  return urls.length > 1 ? `${host} +${urls.length - 1}` : host;
}

function CitePill({
  sources,
}: {
  readonly sources: readonly SourceUrlUIPart[];
}): ReactElement | null {
  const unique = uniqueSources(sources);
  if (unique.length === 0) return null;

  const urls = unique.map((part) => part.url);

  return (
    <span className="not-prose inline-flex align-middle">
      <HoverCard>
        <HoverCardTrigger>
          <Badge className="ml-1 cursor-pointer rounded-full" variant="secondary">
            {sourceTriggerLabel(urls)}
          </Badge>
        </HoverCardTrigger>
        <HoverCardContent className="w-80 space-y-2 p-3" align="start">
          {unique.map((part) => (
            <a
              key={part.sourceId}
              href={part.url}
              rel="noreferrer"
              target="_blank"
              className="block space-y-0.5 rounded-md outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="truncate font-medium text-sm leading-tight">{part.title ?? part.url}</p>
              <p className="truncate break-all text-muted-foreground text-xs">{part.url}</p>
            </a>
          ))}
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}

/** Stable Streamdown custom-tag component; groups come from CiteGroupsContext. */
function ActuateCite(props: CiteNodeProps): ReactElement | null {
  const groups = useContext(CiteGroupsContext);
  const group = props.group;
  const index = typeof group === "string" || typeof group === "number" ? Number(group) : Number.NaN;
  if (!Number.isFinite(index)) return null;
  const parts = groups[index];
  if (!parts || parts.length === 0) return null;
  return <CitePill sources={parts} />;
}

/**
 * Summary Sources (search dump) + one MessageResponse pass with inline cite pills
 * spliced at each text→source boundary.
 */
export const ProseWithCitationsPart = memo(function ProseWithCitationsPart({
  summarySources,
  segments,
  isAnimating = false,
}: ProseWithCitationsPartProps): ReactElement | null {
  const { markdown, groups } = buildCitedMarkdown(segments);

  if (summarySources.length === 0 && segments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {summarySources.length > 0 ? (
        <div className="px-1">
          <SourcesPart parts={summarySources} />
        </div>
      ) : null}
      {markdown ? (
        <CiteGroupsContext.Provider value={groups}>
          <AssistantProseBubble
            markdown={markdown}
            isAnimating={isAnimating}
            contentClassName="overflow-visible"
            allowedTags={{ [PROSE_CITE_TAG]: ["group"] }}
            components={{ [PROSE_CITE_TAG]: ActuateCite }}
          />
        </CiteGroupsContext.Provider>
      ) : null}
    </div>
  );
});
