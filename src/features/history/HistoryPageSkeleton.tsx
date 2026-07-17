import type { ReactElement } from "react";

const SECTION_ROW_COUNTS = [3, 2] as const;
const SECTION_LABELS = ["Today", "Yesterday"] as const;

function SkeletonBar({ className }: { readonly className: string }): ReactElement {
  return <div className={`animate-pulse rounded bg-[#252525] ${className}`} />;
}

function SkeletonChatRow(): ReactElement {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <SkeletonBar className="h-3.5 w-3/5" />
        <SkeletonBar className="h-3 w-1/4" />
      </div>
      <SkeletonBar className="size-6 shrink-0 rounded-md" />
    </div>
  );
}

/** Static placeholders only — no ChatRow, mutations, or ContentSkeleton measure. */
export function HistoryPageSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-8 pt-1" aria-hidden>
      {SECTION_LABELS.map((label, sectionIndex) => (
        <section key={label} className="flex flex-col gap-3">
          <SkeletonBar className="mx-4 h-3.5 w-16" />
          <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] shadow-layered">
            {Array.from({ length: SECTION_ROW_COUNTS[sectionIndex] ?? 2 }, (_, i) => (
              <SkeletonChatRow key={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
