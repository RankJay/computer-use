import type { ReactElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** Query-suspense fallback for home body (header stays mounted outside the boundary). */
export function HomePageSkeleton(): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-6 w-72" />
      </div>
      <div className="flex min-h-12 flex-col gap-2 p-2">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
