/**
 * Generic `actuate://` deep-link plumbing.
 *
 * Register feature handlers with `registerDeepLinkHandler("/path", handler)`,
 * then start the native listener once via `startDeepLinkBootstrap()`.
 */
export { startDeepLinkBootstrap, stopDeepLinkBootstrapForTests } from "@/lib/deep-link/bootstrap";
export {
  parseActuateDeepLink,
  parseActuateDeepLinks,
  type ParsedDeepLink,
} from "@/lib/deep-link/parse";
export {
  clearDeepLinkRouterForTests,
  dispatchDeepLink,
  getDeepLinkAppContext,
  registerDeepLinkHandler,
  setDeepLinkAppContext,
  unregisterDeepLinkHandler,
  type DeepLinkAppContext,
  type DeepLinkHandler,
  type DeepLinkHandlerContext,
  type DeepLinkSource,
} from "@/lib/deep-link/router";
