import type { ReactElement } from "react";

import { AppPageShell } from "@/app/AppPageShell";

/** Shown while a lazy route chunk downloads — chrome-only, no feature imports. */
export function RouteChunkFallback(): ReactElement {
  return <AppPageShell />;
}
