import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { isAnalyticsEnabled } from "@/lib/analytics/enabled";
import { beginIdentifyGeneration } from "@/lib/analytics/identify";
import { sessionQueryOptions } from "@/lib/auth/session-query";
import { getSessionToken } from "@/lib/auth/token-store";

/** Boot hydrate: vault token → session → identify (generation-gated). */
export function AnalyticsIdentityBoot(): null {
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (!isAnalyticsEnabled() || started.current) {
      return;
    }
    started.current = true;

    const { apply } = beginIdentifyGeneration();

    void (async () => {
      const token = await getSessionToken().catch(() => null);
      if (!token) {
        return;
      }
      const user = await queryClient.fetchQuery(sessionQueryOptions());
      if (user) {
        apply(user);
      }
    })();
  }, [queryClient]);

  return null;
}
