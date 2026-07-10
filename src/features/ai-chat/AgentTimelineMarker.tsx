import { LoaderCircleIcon } from "lucide-react";
import type { ReactElement } from "react";

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { cn } from "@/lib/utils";

import type { AgentMarkerRow } from "./types";

export type AgentTimelineMarkerProps = {
  readonly row: AgentMarkerRow;
};

export function AgentTimelineMarker({ row }: AgentTimelineMarkerProps): ReactElement {
  return (
    <Marker
      variant={row.variant ?? "default"}
      role={row.status ? "status" : undefined}
      className="px-px"
    >
      {row.status ? (
        <MarkerIcon>
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        </MarkerIcon>
      ) : null}
      <MarkerContent className={cn(row.live && "shimmer text-muted-foreground")}>
        {row.text}
      </MarkerContent>
    </Marker>
  );
}
