import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { fetchPlatformCapabilities, type PlatformCapabilities } from "@/lib/native/platform";

export const platformCapabilityKeys = {
  all: ["platform-capabilities"] as const,
  current: () => [...platformCapabilityKeys.all, "current"] as const,
};

export function platformCapabilitiesQueryOptions() {
  return queryOptions({
    queryKey: platformCapabilityKeys.current(),
    queryFn: fetchPlatformCapabilities,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** Prefetch + keep cache warm for catalog gating. */
export function usePlatformCapabilities(): PlatformCapabilities | undefined {
  const query = useQuery(platformCapabilitiesQueryOptions());

  useEffect(() => {
    const onFocus = () => {
      void query.refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [query]);

  return query.data;
}
