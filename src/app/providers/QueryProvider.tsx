import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { queryClient } from "@/app/query-client";
import { platformCapabilitiesQueryOptions } from "@/lib/native/platform-queries";

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
