import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { registerAuthDeepLinkHandler } from "@/lib/auth/auth-callback-handler";
import { setDeepLinkAppContext, startDeepLinkBootstrap } from "@/lib/deep-link";

/**
 * Starts the shared `actuate://` listener and registers feature handlers.
 * Add new handlers here (or from their feature modules) via `registerDeepLinkHandler`.
 */
export function DeepLinkBootstrap(): ReactElement | null {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    setDeepLinkAppContext({ queryClient, navigate });
  }, [navigate, queryClient]);

  useEffect(() => {
    registerAuthDeepLinkHandler();
    // Future: registerDeepLinkHandler("/chat/open", handleChatOpen)
    void startDeepLinkBootstrap();
  }, []);

  return null;
}
