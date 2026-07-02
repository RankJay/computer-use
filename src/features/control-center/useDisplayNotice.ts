import { useEffect, useState } from "react";

import { hostRuntime } from "@/agent/host/hostRuntime";

const DISMISS_KEY = "actuate.displayNotice.dismissed";

export type DisplayNotice = {
  readonly displayCount: number;
};

export function useDisplayNotice(): DisplayNotice | null {
  const [notice, setNotice] = useState<DisplayNotice | null>(null);

  useEffect(() => {
    if (!hostRuntime.isDesktop || hostRuntime.native === null) {
      return;
    }
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      return;
    }

    let cancelled = false;
    void hostRuntime.native
      .getDisplayInfo()
      .then((info) => {
        if (cancelled || !info.multiMonitor) {
          return;
        }
        setNotice({ displayCount: info.displayCount });
      })
      .catch(() => {
        /** ignore — dev shells without display IPC */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return notice;
}

export function dismissDisplayNotice(): void {
  sessionStorage.setItem(DISMISS_KEY, "1");
}
