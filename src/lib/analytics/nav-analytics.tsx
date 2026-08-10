import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { captureChatOpened, capturePageview } from "@/lib/analytics/capture";
import { isAnalyticsEnabled } from "@/lib/analytics/enabled";

/** SPA `$pageview` + `chat_opened` for `/chat/:chatId`. */
export function AnalyticsNavListener(): null {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);
  const lastChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) {
      return;
    }
    const path = location.pathname;
    if (lastPathRef.current !== path) {
      lastPathRef.current = path;
      capturePageview(path);
    }

    const chatMatch = /^\/chat\/([^/]+)$/.exec(path);
    const chatId = chatMatch?.[1] ?? null;
    if (chatId && chatId !== lastChatIdRef.current) {
      lastChatIdRef.current = chatId;
      captureChatOpened({ chat_id: chatId });
    }
    if (!chatId) {
      lastChatIdRef.current = null;
    }
  }, [location.pathname]);

  return null;
}
