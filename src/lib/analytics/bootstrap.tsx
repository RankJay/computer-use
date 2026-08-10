import { useEffect, type ReactElement, type ReactNode } from "react";

import { getAnalyticsPort, initAnalytics } from "@/lib/analytics/client";
import { isAnalyticsEnabled } from "@/lib/analytics/enabled";

/**
 * Init analytics port once; best-effort flush on quit / pagehide.
 * Mount under BrowserRouter + AppQueryProvider.
 */
export function AnalyticsBootstrap(props: { readonly children: ReactNode }): ReactElement {
  useEffect(() => {
    let cancelled = false;
    let onHide: ((event: PageTransitionEvent | Event) => void) | null = null;

    void initAnalytics().then(() => {
      if (cancelled || !isAnalyticsEnabled()) {
        return undefined;
      }

      onHide = (event) => {
        if ("persisted" in event && event.persisted) {
          return;
        }
        getAnalyticsPort().flush();
      };

      window.addEventListener("pagehide", onHide);
      window.addEventListener("beforeunload", onHide);

      if (cancelled) {
        window.removeEventListener("pagehide", onHide);
        window.removeEventListener("beforeunload", onHide);
      }
      return undefined;
    });

    return () => {
      cancelled = true;
      if (onHide) {
        window.removeEventListener("pagehide", onHide);
        window.removeEventListener("beforeunload", onHide);
      }
    };
  }, []);

  return <>{props.children}</>;
}
