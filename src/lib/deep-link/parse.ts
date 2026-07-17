const ACTUATE_PROTOCOL = "actuate:";

export type ParsedDeepLink = {
  raw: string;
  /** Normalized path with leading slash, e.g. `/auth/callback`. */
  path: string;
  searchParams: URLSearchParams;
};

/**
 * Parse `actuate://…` URLs into a stable path + query.
 * Host + pathname are joined so both `actuate://auth/callback` and
 * `actuate:///auth/callback` resolve to `/auth/callback`.
 */
export function parseActuateDeepLink(url: string): ParsedDeepLink | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== ACTUATE_PROTOCOL) {
    return null;
  }

  const host = (parsed.hostname || parsed.host).replace(/\/+$/, "");
  let pathname = parsed.pathname || "";
  if (!pathname.startsWith("/")) {
    pathname = `/${pathname}`;
  }
  pathname = pathname.replace(/\/+$/, "") || "";

  const path = host ? `/${host}${pathname === "/" ? "" : pathname}` : pathname || "/";
  const normalized = path.replace(/\/{2,}/g, "/") || "/";

  return {
    raw: trimmed,
    path: normalized,
    searchParams: parsed.searchParams,
  };
}

export function parseActuateDeepLinks(urls: readonly string[]): ParsedDeepLink[] {
  const out: ParsedDeepLink[] = [];
  for (const url of urls) {
    const parsed = parseActuateDeepLink(url);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}
