import { LoaderCircleIcon } from "lucide-react";
import { memo, type ReactElement } from "react";

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { cn } from "@/lib/utils";

import type { AgentMarkerRow } from "../types";

export type MarkerRowProps = {
  readonly row: AgentMarkerRow;
};

export const MarkerRow = memo(function MarkerRow({ row }: MarkerRowProps): ReactElement {
  return (
    <Marker
      variant={row.variant ?? "default"}
      role={row.status ? "status" : undefined}
      className="px-2"
    >
      {row.status ? (
        <MarkerIcon>
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        </MarkerIcon>
      ) : null}
      <MarkerContent className={cn(row.live && "shimmer text-muted-foreground font-medium tracking-tight")}>
        {row.text}
      </MarkerContent>
    </Marker>
  );
});
