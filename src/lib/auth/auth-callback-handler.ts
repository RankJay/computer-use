import { toast } from "sonner";

import { markOttConsumed, wasOttConsumed } from "@/lib/auth/consumed-ott";
import { completeHandoff, handoffErrorMessage } from "@/lib/auth/handoff";
import { getSessionToken } from "@/lib/auth/token-store";
import { AuthApiError } from "@/lib/auth/types";
import {
  parseActuateDeepLink,
  registerDeepLinkHandler,
  type DeepLinkHandler,
  type ParsedDeepLink,
} from "@/lib/deep-link";

export const AUTH_CALLBACK_PATH = "/auth/callback";

const processedTokens = new Set<string>();

let registered = false;

/** Extract OTT from a parsed `/auth/callback` link. */
export function authCallbackTokenFromLink(link: ParsedDeepLink): string | null {
  if (link.path !== AUTH_CALLBACK_PATH) {
    return null;
  }
  const token = link.searchParams.get("token")?.trim();
  return token || null;
}

/** Parse helper for tests / callers that still have a raw URL string. */
export function parseAuthCallbackToken(url: string): string | null {
  const link = parseActuateDeepLink(url);
  if (!link) {
    return null;
  }
  return authCallbackTokenFromLink(link);
}

export function firstAuthCallbackToken(urls: readonly string[]): string | null {
  for (const url of urls) {
    const token = parseAuthCallbackToken(url);
    if (token) {
      return token;
    }
  }
  return null;
}

const handleAuthCallback: DeepLinkHandler = async (link, ctx) => {
  const token = authCallbackTokenFromLink(link);
  if (!token) {
    return;
  }
  if (processedTokens.has(token) || wasOttConsumed(token)) {
    return;
  }

  if (ctx.source === "cold-start") {
    const existing = await getSessionToken().catch(() => null);
    if (existing) {
      processedTokens.add(token);
      markOttConsumed(token);
      return;
    }
  }

  processedTokens.add(token);

  const goToAccount = (): void => {
    // Push so Home (or prior route) stays under Account; Account→Settings
    // still replaces, leaving a single back target instead of a dead-end stack.
    ctx.navigate("/settings/account");
  };

  if (ctx.source === "open") {
    goToAccount();
  }

  try {
    await completeHandoff(token, ctx.queryClient);
    markOttConsumed(token);
    if (ctx.source === "cold-start") {
      goToAccount();
    }
    toast.success("Signed in");
  } catch (error) {
    const invalid =
      error instanceof AuthApiError && (error.code === "invalid_token" || error.status === 400);

    if (invalid) {
      markOttConsumed(token);
      if (ctx.source === "open") {
        toast.error(handoffErrorMessage(error));
      }
      return;
    }

    processedTokens.delete(token);
    toast.error(handoffErrorMessage(error));
  }
};

/** Idempotent — safe to call from app bootstrap. */
export function registerAuthDeepLinkHandler(): void {
  if (registered) {
    return;
  }
  registered = true;
  registerDeepLinkHandler(AUTH_CALLBACK_PATH, handleAuthCallback);
}

/** Test helper. */
export function resetAuthDeepLinkHandlerForTests(): void {
  processedTokens.clear();
  registered = false;
}
