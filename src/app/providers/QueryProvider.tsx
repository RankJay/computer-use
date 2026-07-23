import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { platformCapabilitiesQueryOptions } from "@/lib/native/platform-queries";
import { queryClient } from "@/lib/runtime/query-client";
import { settingsQueryOptions } from "@/lib/settings/queries";

// Overlap settings store I/O with React mount / remaining module eval.
void queryClient.prefetchQuery(settingsQueryOptions());

function PlatformCapabilitiesBootstrap(): null {
  useEffect(() => {
    void queryClient.prefetchQuery(platformCapabilitiesQueryOptions());
  }, []);
  return null;
}

export function AppQueryProvider(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformCapabilitiesBootstrap />
      {props.children}
    </QueryClientProvider>
  );
}
