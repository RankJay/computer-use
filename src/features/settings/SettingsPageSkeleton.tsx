import type { ReactElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";

type SettingsSectionSkeletonProps = {
  rowCount: number;
};

function SettingsSectionSkeleton({ rowCount }: SettingsSectionSkeletonProps): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="mx-4 h-4 w-24 bg-[#252525]" />
      <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] shadow-layered">
        {Array.from({ length: rowCount }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-6 px-4 py-3.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36 bg-[#252525]" />
              <Skeleton className="h-3 w-56 max-w-full bg-[#252525]" />
            </div>
            <Skeleton className="h-8 w-28 shrink-0 bg-[#252525]" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SettingsPageSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-8 pt-1">
      <SettingsSectionSkeleton rowCount={2} />
      <SettingsSectionSkeleton rowCount={2} />
      <SettingsSectionSkeleton rowCount={4} />
      <SettingsSectionSkeleton rowCount={4} />
    </div>
  );
}
