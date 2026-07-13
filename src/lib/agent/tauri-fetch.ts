import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";

const STRIP_HEADERS = [
  "referer",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-dest",
  "sec-fetch-user",
];

function buildProviderHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  // Prefer init headers, then fall back to Request headers (AI SDK / fetch(Request) path).
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  // Tauri plugin-http removes Origin when set to "" (requires unsafe-headers).
  headers.set("Origin", "");

  for (const name of STRIP_HEADERS) {
    headers.delete(name);
  }

  return headers;
}

function toTauriRequestInit(input: RequestInfo | URL, init?: RequestInit): RequestInit {
  const headers = buildProviderHeaders(input, init);

  if (input instanceof Request) {
    const { headers: _ignored, ...restInit } = init ?? {};
    return {
      method: init?.method ?? input.method,
      body: init?.body ?? input.body,
      signal: init?.signal ?? input.signal,
      ...restInit,
      headers,
    };
  }

  return { ...init, headers };
}

function resolveInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Rust-backed fetch for Tauri — strips webview Origin before reqwest. */
export function createProviderFetch(): typeof fetch {
  const providerFetch = (async (input, init) => {
    const url = resolveInputUrl(input);
    return tauriFetch(url, toTauriRequestInit(input, init));
  }) as typeof fetch;

  return providerFetch;
}

export function getProviderFetch(): typeof fetch | undefined {
  if (!isTauriRuntime()) {
    return undefined;
  }

  return createProviderFetch();
}

export function requireProviderFetch(): typeof fetch {
  const providerFetch = getProviderFetch();
  if (!providerFetch) {
    throw new Error(
      "Provider HTTP requires the Actuate desktop runtime. Run with `bun run tauri dev`, not Vite alone.",
    );
  }
  return providerFetch;
}
