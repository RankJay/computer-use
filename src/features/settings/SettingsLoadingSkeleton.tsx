import type { ReactElement } from "react";

export function SettingsLoadingSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-10">
      {[0, 1, 2, 3].map((section) => (
        <div key={section} className="flex flex-col gap-4">
          <div className="h-4 w-24 animate-pulse rounded bg-[#1a1a1a]" />
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3.5 w-32 animate-pulse rounded bg-[#1a1a1a]" />
                <div className="h-3 w-48 animate-pulse rounded bg-[#161616]" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-lg bg-[#1a1a1a]" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
