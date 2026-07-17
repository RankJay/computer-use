import type { QueryClient } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";

import type { ParsedDeepLink } from "@/lib/deep-link/parse";

export type DeepLinkSource = "cold-start" | "open";

export type DeepLinkAppContext = {
  queryClient: QueryClient;
  navigate: NavigateFunction;
};

export type DeepLinkHandlerContext = DeepLinkAppContext & {
  source: DeepLinkSource;
};

export type DeepLinkHandler = (
  link: ParsedDeepLink,
  ctx: DeepLinkHandlerContext,
) => void | Promise<void>;

const handlers = new Map<string, DeepLinkHandler>();

let appContext: DeepLinkAppContext | null = null;

/** Keep navigate/queryClient fresh without restarting the native listener. */
export function setDeepLinkAppContext(next: DeepLinkAppContext): void {
  appContext = next;
}

export function getDeepLinkAppContext(): DeepLinkAppContext | null {
  return appContext;
}

/** Register or replace a handler for an exact path (e.g. `/auth/callback`). */
export function registerDeepLinkHandler(path: string, handler: DeepLinkHandler): void {
  handlers.set(normalizeHandlerPath(path), handler);
}

export function unregisterDeepLinkHandler(path: string): void {
  handlers.delete(normalizeHandlerPath(path));
}

function normalizeHandlerPath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

/** Dispatch one parsed link. Unknown paths are ignored. */
export async function dispatchDeepLink(
  link: ParsedDeepLink,
  source: DeepLinkSource,
): Promise<boolean> {
  const ctx = appContext;
  if (!ctx) {
    return false;
  }
  const handler = handlers.get(link.path);
  if (!handler) {
    return false;
  }
  await handler(link, { ...ctx, source });
  return true;
}

/** Test helper. */
export function clearDeepLinkRouterForTests(): void {
  handlers.clear();
  appContext = null;
}
