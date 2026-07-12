import type { ReactElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";

type HistorySectionSkeletonProps = {
  rowCount: number;
};

function HistorySectionSkeleton({ rowCount }: HistorySectionSkeletonProps): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="mx-4 h-4 w-24 bg-[#252525]" />
      <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] shadow-layered">
        {Array.from({ length: rowCount }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-6 px-4 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48 max-w-full bg-[#252525]" />
              <Skeleton className="h-3 w-28 bg-[#252525]" />
            </div>
            <Skeleton className="size-6 shrink-0 rounded-md bg-[#252525]" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HistoryPageSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-8 pt-1">
      <HistorySectionSkeleton rowCount={3} />
      <HistorySectionSkeleton rowCount={2} />
    </div>
  );
}
