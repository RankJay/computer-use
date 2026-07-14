import type { ReactElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a lazy route chunk downloads — chrome-only, no feature imports. */
export function RouteChunkFallback(): ReactElement {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-start bg-background text-white shadow-none ring-0"></main>
  );
}
