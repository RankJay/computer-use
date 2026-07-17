import type { ReactElement } from "react";

/** Shown while a lazy route chunk downloads — chrome-only, no feature imports. */
export function RouteChunkFallback(): ReactElement {
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-start bg-background text-white shadow-none ring-0"></main>
  );
}
